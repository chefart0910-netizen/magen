// MAGEN - חוות דעת מקצועית על סריקה (סעיף חדש).
// ==========================================================================================
// הבידול מול כל כלי סריקה אוטומטי הוא שאחרי המספרים יושב אדם. סורק אוטומטי מזהה כ-30%
// מליקויי הנגישות ואינו יודע לומר אם ציון 62 בביצועים "בסדר לאתר הזה" או קטלני; מומחה כן.
// לכן חוות הדעת נקשרת ל*סריקה מסוימת* ולא לאתר: היא מתייחסת למספרים שהתקבלו באותו רגע,
// ונכנסת לדוח ה-PDF שהלקוח מקבל.
//
// מי רשאי לכתוב: משתמש שסומן is_expert (או אדמין). זהו סימון ידני שניתן בבק-אופיס - לא
// הרשמה עצמית - כי כל הערך כאן הוא שמישהו בדק את המומחה לפני שדבריו נכנסים לדוח ללקוח.
// כל כתיבה נרשמת ב-audit_log: חוות דעת חתומה בשם היא התחייבות מקצועית, וצריך להיות תיעוד
// של מי כתב אותה ומתי.
//
// בעל האתר קורא בלבד. הוא לא יכול לערוך או למחוק חוות דעת שניתנה על האתר שלו - אחרת
// המנגנון היה חסר ערך.

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ah } = require("../async-handler");
const { hasActiveGrant, decideAccess } = require("../grants-access");

const router = express.Router();
router.use(requireAuth);

const SUMMARY_MIN = 10;
const SUMMARY_MAX = 4000;
const IMPROVEMENTS_MAX = 8000;
// חוות דעת של מומחה על *הציון* שהתקבל: האם המספר האוטומטי משקף את המצב באתר הזה.
const SCORE_OPINIONS = ["accurate", "too_harsh", "too_lenient"];

// תקופת ניסיון: כמה חוות דעת ראשונות של מומחה חדש עוברות אישור לפני שהן נראות ללקוח.
// זה ולא הסינון בכניסה הוא מה שבאמת מגן על הלקוח - אי אפשר לאמת מקצועיות בהרשמה, אבל
// אפשר לוודא שאף אחד לא חותם בשם על דוח לפני שראית מה הוא כותב.
const PROBATION_REVIEWS = 3;

// שולף את הסריקה יחד עם בעליה, כדי להכריע גישה בשאילתה אחת.
async function loadScan(scanId) {
  return db
    .prepare(
      `SELECT scans.id, scans.site_id, scans.status, sites.user_id AS owner_id, sites.url AS site_url
       FROM scans JOIN sites ON sites.id = scans.site_id
       WHERE scans.id = ?`
    )
    .get(scanId);
}

// ההכרעה מי רשאי לגשת לחוות הדעת על סריקה. סימון is_expert לבד *אינו* גישה: מומחה נכנס
// לדוח של לקוח רק אם בעל האתר העניק לו הרשאה לאתר הזה (site_grants), ורק כל עוד ההרשאה
// פעילה. בעל האתר תמיד רשאי, ואדמין רשאי כדי שיוכל לאשר חוות דעת בבק-אופיס.
async function resolveAccess(scan, user) {
  const expert = await loadExpert(user.id);
  const isOwner = scan.owner_id === user.id;
  const canReview = !!expert?.can_review;
  // שולפים הרשאה רק כשהיא יכולה לשנות את התוצאה, כדי לא לעשות שאילתה מיותרת על כל צפייה
  // של בעל האתר בדוח שלו.
  const hasGrant = !isOwner && canReview ? await hasActiveGrant(scan.site_id, user.id) : false;
  const decision = decideAccess({ isOwner, isAdmin: !!user.is_admin, canReview, hasGrant });
  return { expert, isOwner, ...decision };
}

async function loadExpert(userId) {
  const row = await db
    .prepare(
      "SELECT id, email, full_name, is_admin, is_expert, account_type, reviews_approved FROM users WHERE id = ?"
    )
    .get(userId);
  if (!row) return null;
  return { ...row, can_review: !!row.is_expert || !!row.is_admin };
}

// בעל האתר רואה רק חוות דעת שאושרו. הכותב רואה תמיד את שלו (כולל ממתינה), ואדמין
// רואה הכל - אחרת אי אפשר לאשר.
async function listReviews(scanId, viewer) {
  const rows = await db
    .prepare(
      `SELECT r.id, r.scan_id, r.expert_user_id, r.expert_name, r.expert_title,
              r.score_opinion, r.summary, r.improvements, r.status, r.created_at, r.updated_at
       FROM expert_reviews r
       WHERE r.scan_id = ?
       ORDER BY r.created_at ASC`
    )
    .all(scanId);

  if (viewer?.is_admin) return rows;
  return rows.filter((r) => r.status === "published" || r.expert_user_id === viewer?.id);
}

// GET /api/reviews/me - האם המשתמש הנוכחי רשאי לכתוב חוות דעת, ובאיזה שם.
// ה-frontend שומר את פרטי המשתמש ב-localStorage מרגע ההתחברות, ולכן סימון "מומחה" שניתן
// אחרי ההתחברות לא היה מופיע שם עד ניתוק וחיבור מחדש. לכן נשאלים כאן מהשרת.
router.get(
  "/me",
  ah(async (req, res) => {
    const expert = await loadExpert(req.user.id);
    res.json({
      can_review: !!expert?.can_review,
      // נרשם כאיש מקצוע אך טרם אושר - המסך מציג לו שהבקשה ממתינה, במקום להשאיר אותו
      // תוהה למה אין לו את מה שביקש.
      pending_expert: expert?.account_type === "professional" && !expert?.can_review,
      default_name: expert?.full_name || expert?.email || "",
    });
  })
);

// GET /api/reviews/scan/:scanId - חוות הדעת על סריקה מסוימת.
router.get(
  "/scan/:scanId",
  ah(async (req, res) => {
    const scan = await loadScan(req.params.scanId);
    if (!scan) return res.status(404).json({ error: "בדיקה לא נמצאה" });

    const access = await resolveAccess(scan, req.user);
    if (!access.canRead) {
      return res.status(403).json({ error: "אין הרשאה לצפות בחוות הדעת על בדיקה זו" });
    }

    res.json({
      reviews: await listReviews(scan.id, req.user),
      // can_review כאן הוא "רשאי לכתוב על הסריקה הזו", ולא "מסומן כמומחה" - אחרת המסך
      // היה מציג טופס כתיבה למומחה שאין לו הרשאה לאתר, והשרת היה דוחה אותו בסוף.
      can_review: access.canWrite,
      is_expert: !!access.expert?.can_review,
      needs_grant: !!access.expert?.can_review && !access.isOwner && !access.granted && !req.user.is_admin,
      probation: access.canWrite && !req.user.is_admin && (access.expert?.reviews_approved || 0) < PROBATION_REVIEWS,
      my_user_id: req.user.id,
    });
  })
);

// POST /api/reviews/scan/:scanId - כתיבה או עדכון של חוות הדעת של המומחה הנוכחי.
// מכוון: לכל מומחה חוות דעת אחת לכל סריקה (אינדקס ייחודי על scan_id+expert_user_id).
// שליחה חוזרת מעדכנת את הקיימת במקום ליצור שכפול - מומחה שמתקן ניסוח לא אמור להשאיר
// שתי גרסאות סותרות בדוח של הלקוח.
router.post(
  "/scan/:scanId",
  ah(async (req, res) => {
    const scan = await loadScan(req.params.scanId);
    if (!scan) return res.status(404).json({ error: "בדיקה לא נמצאה" });

    const access = await resolveAccess(scan, req.user);
    const expert = access.expert;
    if (!expert?.can_review && !req.user.is_admin) {
      return res.status(403).json({ error: "כתיבת חוות דעת מוגבלת למשתמשים שסומנו כמומחים" });
    }
    // ההרשאה של הלקוח היא התנאי, לא הסימון של המומחה.
    if (!access.canWrite) {
      return res.status(403).json({
        error: "בעל האתר לא העניק לך הרשאה לאתר הזה. יש לבקש ממנו להוסיף אותך בעמוד האתר.",
      });
    }

    if (scan.status !== "completed") {
      return res.status(409).json({ error: "אפשר לחוות דעה רק על בדיקה שהושלמה" });
    }

    const { summary, improvements, expert_title, score_opinion } = req.body || {};
    const cleanSummary = String(summary || "").trim();
    const cleanImprovements = String(improvements || "").trim();
    const cleanTitle = String(expert_title || "").trim().slice(0, 120);
    const cleanName = String(req.body?.expert_name || "").trim().slice(0, 120) || expert.full_name || expert.email;

    if (cleanSummary.length < SUMMARY_MIN) {
      return res.status(400).json({ error: `חוות הדעת קצרה מדי (נדרשים ${SUMMARY_MIN} תווים לפחות)` });
    }
    if (cleanSummary.length > SUMMARY_MAX || cleanImprovements.length > IMPROVEMENTS_MAX) {
      return res.status(400).json({ error: "חוות הדעת ארוכה מהמותר" });
    }
    if (score_opinion && !SCORE_OPINIONS.includes(score_opinion)) {
      return res.status(400).json({ error: "ערך לא תקין בשדה חוות הדעת על הציון" });
    }

    // מומחה בתקופת ניסיון: חוות הדעת נשמרת אך אינה נראית ללקוח עד לאישור. עריכה של
    // חוות דעת שכבר אושרה מחזירה אותה למצב ממתין - אחרת אפשר היה לאשר טקסט אחד
    // ולהחליף אותו אחר כך באחר.
    const onProbation =
      !expert.is_admin && (expert.reviews_approved || 0) < PROBATION_REVIEWS;
    const status = onProbation ? "pending" : "published";

    const existing = await db
      .prepare("SELECT id FROM expert_reviews WHERE scan_id = ? AND expert_user_id = ?")
      .get(scan.id, req.user.id);

    if (existing) {
      await db
        .prepare(
          `UPDATE expert_reviews
           SET expert_name = ?, expert_title = ?, score_opinion = ?, summary = ?, improvements = ?,
               status = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          cleanName,
          cleanTitle || null,
          score_opinion || null,
          cleanSummary,
          cleanImprovements || null,
          status,
          existing.id
        );
    } else {
      await db
        .prepare(
          `INSERT INTO expert_reviews
             (id, scan_id, site_id, expert_user_id, expert_name, expert_title, score_opinion,
              summary, improvements, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          uuidv4(),
          scan.id,
          scan.site_id,
          req.user.id,
          cleanName,
          cleanTitle || null,
          score_opinion || null,
          cleanSummary,
          cleanImprovements || null,
          status
        );
    }

    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)")
      .run(
        uuidv4(),
        req.user.id,
        existing ? "expert_review_updated" : "expert_review_created",
        `scan=${scan.id} site=${scan.site_url}`
      );

    res.status(existing ? 200 : 201).json({
      reviews: await listReviews(scan.id, req.user),
      probation: onProbation,
    });
  })
);

// DELETE /api/reviews/:id - מחיקה ע"י כותב חוות הדעת עצמו, או ע"י אדמין.
router.delete(
  "/:id",
  ah(async (req, res) => {
    const review = await db.prepare("SELECT * FROM expert_reviews WHERE id = ?").get(req.params.id);
    if (!review) return res.status(404).json({ error: "חוות דעת לא נמצאה" });
    if (review.expert_user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: "אפשר למחוק רק חוות דעת שכתבתם" });
    }

    await db.prepare("DELETE FROM expert_reviews WHERE id = ?").run(review.id);
    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)")
      .run(uuidv4(), req.user.id, "expert_review_deleted", `review=${review.id} scan=${review.scan_id}`);

    res.json({ reviews: await listReviews(review.scan_id, req.user) });
  })
);

module.exports = router;
