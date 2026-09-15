// MAGEN - שער יחיד לכל בקשה יוצאת אל אתר שהמשתמש ביקש.
// ==========================================================================================
// למה זה מודול נפרד: ההגנה הזו היתה קיימת רק בנתיב הציבורי (routes/public.js), ולכן
// משתמש *מחובר* - וההרשמה פתוחה לכל אחד - יכול היה להוסיף אתר בכתובת 169.254.169.254
// (מטא-דאטה של ספק הענן) או כתובת בתוך רשת פרטית, ולקבל בחזרה כותרות, עוגיות, תעודה
// ו-URLים שחולצו מגוף התשובה. כלומר: השרת שלנו כלי הצצה פנימה. ההגנה חייבת לשבת בכל
// המסלולים, ולכן היא כאן ולא שם.
//
// הכלל שקבע הבעלים: "אתר מגן אמור להגן ולא להזיק על ידי משתמשים אחרים". שתי מסקנות
// מעשיות שמיושמות כאן:
//   1. בודקים את היעד לפני *כל* בקשה יוצאת, לא רק כשהאתר נוצר. כתובת שנשמרה פעם אחת
//      ואושרה יכולה להצביע מחר על כתובת פנימית (rebinding), ולכן הבדיקה היא בזמן השימוש.
//   2. הפניות (redirect) לא נסרקות אוטומטית. אתר תוקף יכול להחזיר
//      "302 Location: http://169.254.169.254/" וכל הבדיקה שלמעלה נעקפת, כי הבקשה
//      השנייה מעולם לא נבדקה. לכן safeFollowFetch מקבל redirect: "manual" ומעביר כל
//      יעד חדש דרך אותה בדיקה לפני שהוא ממשיך אליו.

const dns = require("node:dns").promises;
const net = require("node:net");

// כמה הפניות מותר לעקוב אחריהן. אתר אמיתי כמעט תמיד מסתדר באחת (http->https, או
// הוספת www); מעבר לשלוש זו כבר שרשרת שלא צריך לרדוף אחריה.
const MAX_REDIRECTS = 3;

// טווחי כתובות שאינם "אינטרנט ציבורי". הרשימה נכתבה כרשימת *חסימה* מפורשת ולא כ"מה
// שנשאר מותר", כי כל טווח שנשכח הוא דלת פתוחה.
function isBlockedAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === 0) return true;                          // 0.0.0.0/8 - "this host"
    if (a === 10) return true;                         // פרטי
    if (a === 127) return true;                        // לוקאלי
    if (a === 169 && b === 254) return true;           // link-local, כולל מטא-דאטה בענן
    if (a === 172 && b >= 16 && b <= 31) return true;  // פרטי
    if (a === 192 && b === 168) return true;           // פרטי
    if (a === 192 && b === 0 && c === 0) return true;  // 192.0.0.0/24 - שימושי פרוטוקול
    if (a === 192 && b === 0 && c === 2) return true;   // 192.0.2.0/24 - תיעוד
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 - בדיקות עומס
    if (a === 198 && b === 51 && c === 100) return true;  // תיעוד
    if (a === 203 && b === 0 && c === 113) return true;   // תיעוד
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;                         // multicast (224/4) ושמור (240/4)
    return false;
  }

  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true;  // unique-local
  if (v6.startsWith("fe80")) return true;                        // link-local
  if (v6.startsWith("ff")) return true;                          // multicast
  if (v6.startsWith("2002:")) return true;                       // 6to4
  if (v6.startsWith("64:ff9b:")) return true;                    // NAT64
  // כתובת IPv4 עטופה ב-IPv6 ("::ffff:127.0.0.1") - נבדקת כ-IPv4, אחרת הטווחים למעלה
  // נעקפים בכתיב אחר.
  if (v6.startsWith("::ffff:")) return isBlockedAddress(v6.slice(7));
  return false;
}

// בודקת יעד ומחזירה את כתובת ה-IP שאושרה. מחזירים אותה כדי שהקורא יוכל לדעת מה בדיוק
// אושר; היא גם מה שיאפשר בעתיד לקבע את החיבור לאותה כתובת בדיוק.
async function assertScannableTarget(url) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("אפשר לסרוק רק כתובות http או https");
  }
  if (url.username || url.password) {
    throw new Error("כתובת עם שם משתמש או סיסמה אינה נסרקת");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("אפשר לסרוק רק את הפורטים הרגילים של אתרי אינטרנט");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    !host.includes(".")
  ) {
    throw new Error("הכתובת אינה אתר ציבורי");
  }
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new Error("הכתובת אינה אתר ציבורי");
  }

  let records = [];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`לא מצאנו את הכתובת ${host}. נא לבדוק את האיות.`);
  }
  if (records.length === 0 || records.some((r) => isBlockedAddress(r.address))) {
    throw new Error("הכתובת אינה אתר ציבורי");
  }
  return records[0].address;
}

// fetch שעוקב אחרי הפניות *בעצמו*, ומעביר כל יעד חדש דרך assertScannableTarget.
// זו הנקודה שבה נחסמת העקיפה הפשוטה: אתר תוקף שמחזיר הפניה לכתובת פנימית.
async function safeFollowFetch(rawUrl, options = {}) {
  let current = new URL(String(rawUrl));
  await assertScannableTarget(current);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current.toString(), { ...options, redirect: "manual" });
    const status = response.status;
    const isRedirect = status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
    if (!isRedirect) {
      // finalUrl מוחזר כדי שהקורא יוכל לדעת לאן הגיע בפועל - למשל בדיקת בעלות, שבה
      // "מצאנו את האסימון" חייב להיות תלוי בשאלה *באיזה* מקור הוא נמצא.
      return { response, finalUrl: current.toString(), redirected: hop > 0 };
    }

    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: current.toString(), redirected: hop > 0 };
    }
    const next = new URL(location, current);
    await assertScannableTarget(next);
    current = next;
  }

  throw new Error("האתר מפנה יותר מדי פעמים");
}

module.exports = { isBlockedAddress, assertScannableTarget, safeFollowFetch, MAX_REDIRECTS };
