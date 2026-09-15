// MAGEN - ניהול אתרים של המשתמש (סעיף 3 במפרט - הוספה/רשימה/מחיקה + אימות בעלות לפני
// בדיקות רגישות כמו full_load / active_pentest, ראו scans.js).

const express = require("express");
const dns = require("node:dns").promises;
const crypto = require("node:crypto");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ah } = require("../async-handler");
const { normalizeUrl } = require("../normalize-url");
const { assertScannableTarget, safeFollowFetch } = require("../ssrf-guard");

const router = express.Router();
router.use(requireAuth);

// GET /api/sites - רשימת האתרים של המשתמש המחובר, כולל מספר הבדיקות שבוצעו לכל אתר
router.get(
  "/",
  ah(async (req, res) => {
    const sites = await db
      .prepare(
        `SELECT sites.*, COUNT(scans.id) as scans_count
         FROM sites
         LEFT JOIN scans ON scans.site_id = sites.id
         WHERE sites.user_id = ?
         GROUP BY sites.id
         ORDER BY sites.created_at DESC`
      )
      .all(req.user.id);

    res.json({ sites });
  })
);

// POST /api/sites - הוספת אתר חדש למעקב
router.post(
  "/",
  ah(async (req, res) => {
    const { url: rawUrl, label } = req.body || {};
    const url = normalizeUrl(rawUrl);
    if (!url) {
      return res.status(400).json({ error: "כתובת אתר לא תקינה" });
    }

    // אותה בדיקה שהיתה רק בעמוד הציבורי. בלעדיה כל מי שנרשם - וההרשמה פתוחה - היה
    // מוסיף "אתר" בכתובת פנימית (169.254.169.254, 10.x, localhost) ומקבל בחזרה, דרך
    // סריקת האבטחה, כותרות ותוכן מתוך הרשת הפנימית. הבדיקה חוזרת שוב לפני כל סריקה,
    // כי כתובת שאושרה היום יכולה להצביע מחר על מקום אחר.
    try {
      await assertScannableTarget(new URL(url));
    } catch (err) {
      return res.status(400).json({ error: err.message || "הכתובת אינה אתר ציבורי" });
    }

    const id = uuidv4();
    await db
      .prepare("INSERT INTO sites (id, user_id, url, label) VALUES (?, ?, ?, ?)")
      .run(id, req.user.id, url, label || null);

    const site = await db.prepare("SELECT * FROM sites WHERE id = ?").get(id);
    res.status(201).json({ site });
  })
);

// DELETE /api/sites/:id - הסרת אתר מהמעקב (רק הבעלים)
router.delete(
  "/:id",
  ah(async (req, res) => {
    const site = await db
      .prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    // מוחקים קודם את הסריקות המשויכות (אין ON DELETE CASCADE ב-schema הנוכחי)
    await db.prepare("DELETE FROM scans WHERE site_id = ?").run(site.id);
    await db.prepare("DELETE FROM sites WHERE id = ?").run(site.id);

    res.json({ ok: true });
  })
);

// PATCH /api/sites/:id/schedule - בעל האתר קובע תזמון סריקה אוטומטית.
// התזמון עצמו מורץ מ-routes/cron.js; כאן רק נשמרת הבחירה.
const ALLOWED_SCHEDULES = ["weekly", "monthly"];

router.patch(
  "/:id/schedule",
  ah(async (req, res) => {
    const site = await db
      .prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    const raw = req.body?.schedule;
    // null / "" / "off" כולם מכבים - הממשק לא צריך לדעת איזה מהם נשמר.
    const schedule = raw && ALLOWED_SCHEDULES.includes(raw) ? raw : null;
    if (raw && !schedule && raw !== "off" && raw !== "") {
      return res.status(400).json({ error: "תזמון לא נתמך" });
    }

    await db.prepare("UPDATE sites SET scan_schedule = ? WHERE id = ?").run(schedule, site.id);

    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'schedule_changed', ?)")
      .run(uuidv4(), req.user.id, `site=${site.url} schedule=${schedule || "off"}`);

    const updated = await db.prepare("SELECT * FROM sites WHERE id = ?").get(site.id);
    res.json({ site: updated });
  })
);

// --- אימות בעלות על דומיין ----------------------------------------------------------------
// עד עכשיו הנתיב הזה רק הדליק את הדגל: כל אחד היה מאשר בעלות על כל אתר בעולם בלחיצה אחת,
// והדגל הזה הוא מה שפותח בדיקת עומס מלאה ופנטסט אקטיבי - בדיקות שמותר להפעיל רק על אתר
// שלך. עכשיו יש בדיקה אמיתית: המשתמש מקבל אסימון, שם אותו באתר או ב-DNS, והשרת מוודא.
//
// שלוש דרכים, אחת מספיקה - כי אוכלוסיית היעד היא עסקים קטנים: מי שיודע לגעת ב-DNS יעשה
// DNS, ומי שיש לו רק גישה לוורדפרס ישים תג meta.
//
// חריג: אדמין מאומת אוטומטית. בעל המערכת צריך לבדוק את MAGEN על אתרים שאינם שלו, ואין
// טעם לחסום אותו מול עצמו. האחריות על מה שהוא מפעיל היא שלו.

const VERIFY_TIMEOUT_MS = 8000;
const FILE_PATH = "/.well-known/magen-verify.txt";

function newToken() {
  return crypto.randomBytes(16).toString("hex");
}

async function ensureToken(site) {
  if (site.verification_token) return site.verification_token;
  const token = newToken();
  await db.prepare("UPDATE sites SET verification_token = ? WHERE id = ?").run(token, site.id);
  return token;
}

function hostVariants(hostname) {
  const bare = hostname.replace(/^www\./i, "");
  const names = new Set([hostname, bare]);
  for (const n of [...names]) names.add(`_magen.${n}`);
  return [...names];
}

async function checkDns(hostname, token) {
  for (const name of hostVariants(hostname)) {
    try {
      const records = await dns.resolveTxt(name);
      const flat = records.map((chunks) => chunks.join("")).join(" ");
      if (flat.includes(`magen-verify=${token}`)) return { ok: true, method: "dns", where: name };
    } catch {
      // אין רשומה בשם הזה - ממשיכים לשם הבא.
    }
  }
  return { ok: false };
}

// אימות בעלות חייב לקרוא את האסימון *מהדומיין שמוצהר עליו*, ולא מכל מקום שהדומיין
// מפנה אליו. עם redirect: "follow" הקודם, כל הפניה פתוחה או catch-all של ספק אחסון
// שמגיעה לתוכן של המבקש היתה מאשרת לו בעלות על אתר של מישהו אחר - ואימות בעלות הוא
// מה שפותח בדיקת עומס ופנטסט אקטיבי. לכן: כל הפניה החוצה מהמקור הנבדק = כישלון.
async function fetchText(url) {
  const expectedOrigin = new URL(url).origin;
  try {
    const { response, finalUrl } = await safeFollowFetch(url, {
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      headers: { "User-Agent": "MAGEN-OwnershipCheck/1.0" },
    });
    if (!response.ok) return null;
    if (new URL(finalUrl).origin !== expectedOrigin) return null;
    return (await response.text()).slice(0, 200000);
  } catch {
    return null;
  }
}

async function checkFile(origin, token) {
  const body = await fetchText(origin + FILE_PATH);
  if (body && body.includes(token)) return { ok: true, method: "file", where: origin + FILE_PATH };
  return { ok: false };
}

async function checkMetaTag(origin, token) {
  const html = await fetchText(origin + "/");
  if (!html) return { ok: false };
  // מחפשים תג meta בשם magen-verify עם האסימון, בכל סדר של המאפיינים.
  const pattern = new RegExp(
    `<meta[^>]+(?:name=["']magen-verify["'][^>]+content=["']${token}["']` +
      `|content=["']${token}["'][^>]+name=["']magen-verify["'])`,
    "i"
  );
  if (pattern.test(html)) return { ok: true, method: "meta", where: origin + "/" };
  return { ok: false };
}

async function markVerified(req, site, method) {
  await db
    .prepare(
      "UPDATE sites SET ownership_verified = 1, verification_method = ?, verified_at = datetime('now') WHERE id = ?"
    )
    .run(method, site.id);

  await db
    .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'ownership_verified', ?)")
    .run(uuidv4(), req.user.id, `site=${site.url} method=${method}`);
}

async function getOwnSite(req) {
  return db
    .prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
}

// GET /api/sites/:id/verification - האסימון וההוראות להצגה למשתמש.
router.get(
  "/:id/verification",
  ah(async (req, res) => {
    const site = await getOwnSite(req);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    const token = await ensureToken(site);
    const host = new URL(site.url).hostname;

    res.json({
      verified: !!site.ownership_verified,
      method: site.verification_method || null,
      verified_at: site.verified_at || null,
      admin_exempt: !!req.user.is_admin,
      token,
      instructions: {
        dns: { name: `_magen.${host.replace(/^www\./i, "")}`, type: "TXT", value: `magen-verify=${token}` },
        file: { path: FILE_PATH, content: token },
        meta: { tag: `<meta name="magen-verify" content="${token}">` },
      },
    });
  })
);

// POST /api/sites/:id/verify-ownership - בדיקה אמיתית מול האתר או ה-DNS.
router.post(
  "/:id/verify-ownership",
  ah(async (req, res) => {
    const site = await getOwnSite(req);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    if (site.ownership_verified) {
      return res.json({ site, already: true });
    }

    if (req.user.is_admin) {
      await markVerified(req, site, "admin");
      const updated = await db.prepare("SELECT * FROM sites WHERE id = ?").get(site.id);
      return res.json({ site: updated, method: "admin" });
    }

    const token = await ensureToken(site);
    const url = new URL(site.url);
    const origin = url.origin;

    const results = await Promise.all([
      checkDns(url.hostname, token),
      checkFile(origin, token),
      checkMetaTag(origin, token),
    ]);
    const hit = results.find((r) => r.ok);

    if (!hit) {
      return res.status(400).json({
        error:
          "לא מצאנו את האסימון. בדקנו רשומת DNS TXT, את הקובץ ב-" +
          FILE_PATH +
          " ואת תג ה-meta בעמוד הבית. אם הרגע הוספתם רשומת DNS - היא יכולה לקחת עד כמה שעות.",
        token,
      });
    }

    await markVerified(req, site, hit.method);
    const updated = await db.prepare("SELECT * FROM sites WHERE id = ?").get(site.id);
    res.json({ site: updated, method: hit.method, where: hit.where });
  })
);

module.exports = router;
