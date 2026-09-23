// MAGEN - בדיקת הצהרת נגישות לפי תקנה 35(ה).
// ==========================================================================================
// למה דווקא הבדיקה הזו, ולמה היא מקבלת מודול משלה:
//
// רוב התביעות בישראל בנושא נגישות אתרים לא היו על אתר שאי אפשר להשתמש בו. הן היו על
// *הצהרת נגישות חסרה או פגומה*. בפסק הדין של השופט עודד מאור (ת"א, ינואר 2024) שש בקשות
// אישור נדחו - הנתבעים היו קוסמטיקאית, שמאי, מספרה, קצב, חנות חיות וחנות צעצועים - וכולן
// נסבו על הפרה טכנית מהסוג הזה.
//
// זה חשוב לנו משתי סיבות:
//   1. זו עילה *בינארית*. או שיש באתר הצהרת נגישות עם פרטי רכז נגישות, או שאין. אין כאן
//      שום שיקול דעת של מומחה, ולכן זו בדיוק הבדיקה שכלי אוטומטי רשאי להכריע בה - בניגוד
//      ל"האם האתר עומד בת"י 5568", שאותה שום סורק לא יכול להכריע (סריקה אוטומטית מזהה
//      כ-30%-40% מדרישות WCAG, לפי רשות הפיקוח הגרמנית עצמה).
//   2. אף אחד מהסורקים בשוק לא מדווח עליה כפריט נפרד. הם בודקים WCAG; החוק הישראלי
//      נתבע על תקנה 35(ה).
//
// מה התקנה דורשת (תקנה 35(ה) לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות
// לשירות), תשע"ג-2013): פרסום הצהרת נגישות באתר, הכוללת את פרטי ההתקשרות עם רכז הנגישות.
//
// מה הכלי הזה *לא* אומר: הוא לא אומר שההצהרה נכונה, שתוכנה מדויק, או שהאתר נגיש. הוא
// אומר אם היא קיימת ואם יש בה פרטי קשר. זו הצהרה שאפשר לעמוד מאחוריה.

const { safeFollowFetch } = require("../ssrf-guard");

const UA = "MagenAccessibilityCheck/1.0 (+https://magen-pi.vercel.app)";
const TIMEOUT_MS = 10000;
const MAX_HTML = 400000;

// נתיבים מקובלים להצהרת נגישות באתרים ישראליים. נבדקים רק אם לא נמצא קישור בעמוד הבית -
// כדי לא לשלוח לאתר של אדם זר סדרת בקשות מיותרת.
const COMMON_PATHS = [
  "/accessibility",
  "/accessibility-statement",
  "/negishut",
  "/נגישות",
  "/הצהרת-נגישות",
  "/accessibility.html",
  "/page/accessibility",
];

// ווידג'טים ("overlay") מוכרים. זיהוי שלהם הוא נתון בפני עצמו: הם הפתרון שהשוק הישראלי
// מוכר, והם *אינם* תחליף לנגישות אמיתית - ה-FTC קנס את accessiBe במיליון דולר בינואר 2025
// בדיוק על הצגתם כמביאים לעמידה ב-WCAG. נוכחות ווידג'ט גם אינה מחליפה הצהרת נגישות.
const OVERLAY_SIGNATURES = [
  { vendor: "accessiBe", pattern: /accessibe\.com|acsbapp\.com|acsb\.js/i },
  { vendor: "UserWay", pattern: /userway\.org|userway\.js/i },
  { vendor: "EqualWeb", pattern: /equalweb\.com|equalweb\.js|nagich\.co\.il|nagich\.com/i },
  { vendor: "Vee", pattern: /vee\.co\.il|veeaccessibility/i },
  { vendor: "Enable", pattern: /enable\.co\.il/i },
  { vendor: "אקססיבל", pattern: /accessible\.org\.il/i },
  { vendor: "נגיש בקליק", pattern: /negishbaclick|nagishbaclick/i },
  { vendor: "עושים שוויון", pattern: /equality\.co\.il/i },
];

// טקסט או כתובת שמעידים על קישור להצהרת נגישות.
const LINK_TEXT = /הצהר\w*\s*נגישות|הצהרת\s*הנגישות|accessibility\s*statement|declaration\s*of\s*accessibility|נגישות/i;
const LINK_HREF = /negishut|negishoot|nagish|accessib|accessibility|%d7%a0%d7%92%d7%99%d7%a9%d7%95%d7%aa/i;

// רכז נגישות + דרך ליצור איתו קשר. התקנה דורשת את פרטי ההתקשרות, ולכן הצהרה בלי דרך
// ליצור קשר אינה עומדת בה.
const COORDINATOR = /רכז\w*\s*(ה)?נגישות|ממונה\s*(ה)?נגישות|accessibility\s*(coordinator|officer)/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?972[-\s]?|0)(?:[23489]|5[0-9]|7[2-9])[-\s]?\d{3}[-\s]?\d{4}/;

// אזכור של המסגרת הנורמטיבית. לא נדרש בתקנה, אבל הצהרה שמזכירה את התקן היא אינדיקציה
// לכך שמישהו באמת טיפל בנושא ולא הדביק פסקה גנרית.
const STANDARD_MENTION = /ת["״']?י\s*5568|5568|WCAG|תקנות\s*שוויון\s*זכויות/i;

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
}

async function getHtml(url) {
  const { response, finalUrl } = await safeFollowFetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return { ok: false, status: response.status, finalUrl };
  const type = response.headers.get("content-type") || "";
  if (!/html/i.test(type)) return { ok: false, status: response.status, finalUrl, notHtml: true };
  const html = (await response.text()).slice(0, MAX_HTML);
  return { ok: true, status: response.status, finalUrl, html };
}

// מוצא קישורים בעמוד שנראים כמובילים להצהרת נגישות.
function findStatementLinks(html, baseUrl) {
  const links = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const href = match[1];
    const text = stripTags(match[2]).trim();
    if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) continue;
    const hrefHit = LINK_HREF.test(href);
    const textHit = LINK_TEXT.test(text);
    if (!hrefHit && !textHit) continue;
    try {
      const absolute = new URL(href, baseUrl);
      links.push({ url: absolute.toString(), text: text.slice(0, 80), matched: hrefHit ? "href" : "text" });
    } catch {
      // href פגום - מדלגים.
    }
    if (links.length >= 5) break;
  }
  return links;
}

function detectOverlay(html) {
  for (const { vendor, pattern } of OVERLAY_SIGNATURES) {
    if (pattern.test(html)) return vendor;
  }
  return null;
}

// בודק עמוד מועמד: האם הוא באמת הצהרת נגישות, והאם יש בה פרטי קשר.
function assessStatementPage(text) {
  const mentionsAccessibility = /נגישות|accessibility/i.test(text);
  if (!mentionsAccessibility) return null;

  const hasCoordinator = COORDINATOR.test(text);
  const hasEmail = EMAIL.test(text);
  const hasPhone = PHONE.test(text);
  const hasContact = hasEmail || hasPhone;

  return {
    mentions_standard: STANDARD_MENTION.test(text),
    names_coordinator: hasCoordinator,
    has_contact: hasContact,
    contact_kinds: [hasEmail && "email", hasPhone && "phone"].filter(Boolean),
    // אורך הטקסט מבדיל בין הצהרה אמיתית לבין המילה "נגישות" שמופיעה בתפריט.
    length: text.length,
  };
}

/**
 * בודק אתר אחד. מחזיר תמיד אובייקט - גם בכישלון - כדי שסקר על מאות אתרים לא ייפול
 * בגלל אתר אחד שלא עונה.
 *
 * status:
 *   'unreachable'      - האתר לא ענה
 *   'none'             - אין קישור להצהרה ואין עמוד בנתיב מקובל
 *   'link_only'        - יש קישור, אך העמוד שמאחוריו לא נטען או אינו הצהרה
 *   'statement'        - יש הצהרה, אך בלי פרטי התקשרות
 *   'statement_contact'- יש הצהרה עם פרטי התקשרות (זה מה שהתקנה דורשת)
 */
async function checkAccessibilityStatement(rawUrl, { probeCommonPaths = true } = {}) {
  const result = {
    url: rawUrl,
    status: "unreachable",
    overlay: null,
    statement_url: null,
    details: null,
    error: null,
  };

  let home;
  try {
    home = await getHtml(rawUrl);
  } catch (err) {
    result.error = String(err?.message || err);
    return result;
  }
  if (!home.ok) {
    result.error = home.notHtml ? "התשובה אינה HTML" : `HTTP ${home.status}`;
    return result;
  }

  result.final_url = home.finalUrl;
  result.overlay = detectOverlay(home.html);

  const candidates = findStatementLinks(home.html, home.finalUrl);

  // אם העמוד עצמו הוא הצהרה (קורה באתרי עמוד-אחד), בודקים אותו לפני שמבקשים עוד עמודים.
  const homeText = stripTags(home.html);
  const homeAssessment = /הצהרת נגישות|accessibility statement/i.test(homeText)
    ? assessStatementPage(homeText)
    : null;

  const tried = new Set();
  const toTry = candidates.map((c) => c.url);

  if (!toTry.length && probeCommonPaths) {
    for (const path of COMMON_PATHS) {
      try {
        toTry.push(new URL(path, home.finalUrl).toString());
      } catch {
        // נתיב פגום - מדלגים.
      }
    }
  }

  for (const candidate of toTry.slice(0, 7)) {
    if (tried.has(candidate)) continue;
    tried.add(candidate);

    let page;
    try {
      page = await getHtml(candidate);
    } catch {
      continue;
    }
    if (!page.ok) continue;

    const text = stripTags(page.html);
    const assessment = assessStatementPage(text);
    // סף אורך: עמוד שמזכיר "נגישות" בתפריט בלבד אינו הצהרה.
    if (!assessment || assessment.length < 400) continue;

    result.statement_url = page.finalUrl;
    result.details = assessment;
    result.status = assessment.has_contact ? "statement_contact" : "statement";
    if (!result.overlay) result.overlay = detectOverlay(page.html);
    return result;
  }

  if (homeAssessment && homeAssessment.length >= 400) {
    result.statement_url = home.finalUrl;
    result.details = homeAssessment;
    result.status = homeAssessment.has_contact ? "statement_contact" : "statement";
    return result;
  }

  result.status = candidates.length ? "link_only" : "none";
  if (candidates.length) result.statement_url = candidates[0].url;
  return result;
}

module.exports = {
  checkAccessibilityStatement,
  detectOverlay,
  OVERLAY_SIGNATURES,
  COMMON_PATHS,
};
