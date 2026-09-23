// MAGEN - שפות. עברית ואנגלית.
// ==========================================================================================
// למה מילון ולא ספריית i18n: שתי שפות, מחרוזות ידועות, ואפס תלויות נוספות בפונקציה
// הסרברלס. אם יתווספו שפות או צורות רבים מורכבות - אז כדאי לשקול ספרייה.
//
// זיהוי השפה: דפדפן שמצהיר על עברית מקבל עברית, כל דפדפן אחר מקבל אנגלית. מעל זה,
// בחירה מפורשת של המשתמש (המחלף) גוברת תמיד ונשמרת.
//
// הכתובות: עברית בשורש (/), אנגלית תחת /en. לכל שפה כתובת נפרדת שגוגל מאנדקס בנפרד -
// אחרת האנגלית לא מדורגת בכלל, וזו כל הסיבה שהוספנו אותה.

export const LANGS = ["he", "en"];
export const DEFAULT_LANG = "he";
export const STORAGE_KEY = "magen_lang";

export function detectLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGS.includes(stored)) return stored;
  } catch {
    // דפדפן שחוסם אחסון - ממשיכים לזיהוי לפי הדפדפן.
  }
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || ""];
  // 'he', 'he-IL' ו-'iw' (הקוד ההיסטורי לעברית, שדפדפנים ותיקים עוד שולחים) - כולם עברית.
  const isHebrew = candidates.some((l) => /^(he|iw)\b/i.test(String(l)));
  return isHebrew ? "he" : "en";
}

export function dirFor(lang) {
  return lang === "he" ? "rtl" : "ltr";
}

// מוסיף את קידומת השפה לכתובת פנימית. עברית נשארת בשורש.
export function localizePath(path, lang) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (lang !== "en") return clean;
  return clean === "/" ? "/en" : `/en${clean}`;
}

const he = {
  langName: "עברית",
  switchTo: "English",
  switchLabel: "שפה",

  brandTagline: "בריאות האתר שלך",

  nav: { login: "התחברות", signup: "הרשמה", accessibility: "הצהרת נגישות" },

  landing: {
    eyebrow: "בריאות האתר שלך",
    titleA: "האתר שלך עובד.",
    titleB: "השאלה היא מה שבור בו ואתה לא רואה.",
    lead:
      "MAGEN סורק אתרים של עסקים קטנים ועצמאיים ומחזיר דוח בעברית: נגישות לפי תקן ישראלי 5568, אבטחה, ביצועים ו-SEO. בדיקת האבטחה הראשונה חינם, כאן, בלי להירשם.",
    urlLabel: "כתובת האתר שתיבדק",
    urlPlaceholder: "example.co.il",
    scanBtn: "בדוק את האתר",
    scanning: "סורק…",
    passiveNote:
      "בדיקה פסיבית בלבד - קוראים את מה שהאתר מחזיר לכל גולש, לא נוגעים בו ולא נכנסים אליו.",
    emptyUrl: "נא להזין כתובת אתר",
    loadingNote: "בודקים כותרות אבטחה, תעודת TLS, עוגיות ותוכן מעורב. זה לוקח כמה שניות.",
    scoreLabel: "ציון אבטחה",
    findingsTitle: "הממצאים הבולטים",
    // תקנה 35(ה) - ראו lib/services/accessibility-statement.js. זו הבדיקה היחידה במוצר
    // שנותנת תשובה חד-משמעית לשאלה משפטית, ולכן היא מוצגת ככרטיס נפרד ולא כעוד ממצא.
    stmtTitle: "הצהרת נגישות (תקנה 35(ה))",
    stmtOk: "נמצאה הצהרת נגישות עם פרטי התקשרות.",
    stmtNoContact: "נמצאה הצהרת נגישות, אך בלי דוא\"ל או טלפון ליצירת קשר. התקנה דורשת את פרטי ההתקשרות עם רכז הנגישות.",
    stmtBroken: "יש קישור להצהרת נגישות, אבל העמוד שמאחוריו אינו נטען או אינו מכיל הצהרה.",
    stmtNone: "לא נמצאה הצהרת נגישות באתר.",
    stmtWhy:
      "זו ההפרה שעליה הוגשו בפועל רוב התביעות בישראל - לא נגישות לקויה, אלא הצהרה חסרה. בינואר 2024 נדחו בבית המשפט המחוזי בת\"א שש בקשות אישור מהסוג הזה נגד עסקים קטנים.",
    stmtOverlay: (vendor) =>
      `זוהה ווידג'ט נגישות (${vendor}). ווידג'ט אינו מחליף הצהרת נגישות ואינו הופך אתר לנגיש - ה-FTC קנס את accessiBe במיליון דולר בינואר 2025 על הצגתו כמביא לעמידה בתקן.`,
    clean: "לא נמצאו ממצאי אבטחה פסיביים באתר הזה. זה מצב טוב - ונבדק כאן רק חלק אחד מהתמונה.",
    lockedMore: (n) => `נותרו עוד ${n} ממצאים, וההסבר מה לעשות עם כל אחד מהם.`,
    lockedNone: "הדוח המלא כולל גם נגישות לפי תקן ישראלי 5568, ביצועים ו-SEO.",
    cta: "פתיחת חשבון וקבלת הדוח המלא",
    checksTitle: "מה נבדק",
    audienceTitle: "למי זה מיועד",
    audienceA:
      "לעסקים קטנים, עצמאיים ובעלי אתר בודד - מי שאין לו ספק אבטחה ואין לו מי שיבדוק את האתר אחרי שהוא הוקם. חברות גדולות כבר מכוסות; הפער נמצא כאן.",
    audienceB:
      "בנוסף, אנשי מקצוע שבונים אתרים יכולים לצרף לדוח חוות דעת אנושית משלהם - הלקוח מקבל גם את המספרים וגם מה לעשות איתם.",
    ctaTitle: "בדיקה אחת, בעברית, בלי כרטיס אשראי",
    ctaSignup: "פתיחת חשבון",
    ctaLogin: "כבר יש לי חשבון",
    footerLive: "בדיקה חיה, משותפת לכל המבקרים",
    checks: [
      {
        title: "נגישות לפי תקן ישראלי 5568",
        body:
          "בדיקה אוטומטית מול כלל הכשלים שנתפסים בכלים - ניגודיות, ניווט מקלדת, תוויות לטפסים וקוראי מסך. זה התחום שבו אתר ישראלי חשוף לתביעה.",
      },
      {
        title: "אבטחה",
        body:
          "כותרות אבטחה, עוגיות, תוקף תעודת TLS, אכיפת HTTPS ותוכן מעורב. בדיקה פסיבית - לא נוגעים באתר.",
      },
      {
        title: "ביצועים",
        body: "Lighthouse על דפדפן אמיתי: מדדי Core Web Vitals, זמן טעינה, ומה בדיוק מאט את העמוד.",
      },
      { title: "SEO טכני", body: "מה שמונע מגוגל לקרוא ולדרג את העמודים - כותרות, תיאורים, מבנה וקישוריות." },
    ],
  },

  severity: { critical: "קריטי", serious: "חמור", moderate: "בינוני", minor: "קל" },

  login: {
    title: "התחברות",
    sub: "שמחים לראות אותך שוב.",
    email: "אימייל",
    password: "סיסמה",
    submit: "התחבר",
    submitting: "מתחבר...",
    noAccount: "עדיין אין לך חשבון?",
    signupLink: "הרשם עכשיו",
    seoDesc: "התחברו לחשבון MAGEN כדי לסרוק את האתר שלכם ולצפות בדוחות ביצועים, נגישות, SEO ואבטחה.",
  },

  signup: {
    title: "יצירת חשבון",
    sub: "התחל לסרוק אתרים תוך פחות מדקה — אתר אחד בחינם, ללא כרטיס אשראי.",
    fullName: "שם מלא",
    email: "אימייל",
    howUse: "איך תשתמשו ב-MAGEN?",
    ownerTitle: "יש לי אתר",
    ownerHint: "בדיקה וניטור של האתר שלי",
    proTitle: "אני איש מקצוע",
    proHint: "בונה או מתחזק אתרים עבור לקוחות",
    yourSite: "כתובת האתר שלכם",
    yourSiteHint: "האתר יתווסף לחשבון ותוכלו לסרוק אותו. תוצאת הסריקה היא חלק מבדיקת הבקשה.",
    expertise: "תחום ההתמחות (לא חובה)",
    expertisePlaceholder: "למשל: בניית אתרי וורדפרס · נגישות דיגיטלית",
    proNotice:
      "חשבון איש מקצוע נבדק ידנית לפני שמתאפשרת כתיבת חוות דעת על סריקות, וגם לאחר האישור חוות הדעת הראשונות נקראות לפני שהן מגיעות ללקוח. עד לאישור החשבון פעיל רגיל, וניתן להוסיף אתרים ולסרוק אותם.",
    password: "סיסמה (8 תווים לפחות)",
    submit: "צור חשבון",
    submitting: "יוצר חשבון...",
    haveAccount: "כבר יש לך חשבון?",
    loginLink: "התחבר",
    seoDesc:
      "פתחו חשבון MAGEN וסרקו אתר אחד בחינם - ביצועים, נגישות לפי תקן ישראלי 5568, SEO ואבטחה. ללא כרטיס אשראי.",
  },

  publicScan: {
    reportLabel: "דוח בריאות אתר",
    scannedAt: (d) => `נבדק ב-${d}`,
    security: "אבטחה",
    accessibility: "נגישות",
    performance: "ביצועים",
    seo: "SEO",
    findingsTitle: "הממצאים הבולטים",
    more: (n) => `ועוד ${n} ממצאים בדוח המלא.`,
    ctaTitle: "רוצים לדעת מה מצב האתר שלכם?",
    ctaBody: "הדוח הזה הופק ב-MAGEN. בדיקה ראשונה חינם.",
    ctaBtn: "בדיקת האתר שלי",
    notFoundTitle: "התוצאה לא נמצאה",
    newScan: "בדיקת אתר חדשה",
    loading: "טוען…",
    seoTitle: (host) => `בריאות האתר ${host}`,
    seoDesc: (host, date) =>
      `תוצאות בדיקת MAGEN עבור ${host} - נגישות, אבטחה, ביצועים ו-SEO. נבדק ב-${date}.`,
  },
};

const en = {
  langName: "English",
  switchTo: "עברית",
  switchLabel: "Language",

  brandTagline: "your site's health",

  nav: { login: "Log in", signup: "Sign up", accessibility: "Accessibility statement" },

  landing: {
    eyebrow: "your site's health",
    titleA: "Your website works.",
    titleB: "The question is what's broken in it that you can't see.",
    lead:
      "MAGEN scans websites for small businesses and freelancers and returns a plain report: accessibility, security, performance and technical SEO. The first security check is free, right here, without signing up.",
    urlLabel: "Website address to check",
    urlPlaceholder: "example.com",
    scanBtn: "Check this site",
    scanning: "Scanning…",
    passiveNote:
      "Passive check only — we read what the site returns to any visitor. We don't touch it and we don't log in.",
    emptyUrl: "Please enter a website address",
    loadingNote: "Checking security headers, the TLS certificate, cookies and mixed content. Takes a few seconds.",
    scoreLabel: "Security score",
    findingsTitle: "Top findings",
    // Israeli Regulation 35(e). Kept in English too because the EU/US visitor needs to
    // understand what this check is before the Israeli framing means anything to them.
    stmtTitle: "Accessibility statement",
    stmtOk: "An accessibility statement with contact details was found.",
    stmtNoContact: "An accessibility statement was found, but with no email or phone. The regulation requires contact details for the accessibility coordinator.",
    stmtBroken: "There is a link to an accessibility statement, but the page behind it does not load or contains no statement.",
    stmtNone: "No accessibility statement was found on this site.",
    stmtWhy:
      "In Israel this specific omission — not poor accessibility — is what most accessibility claims were actually filed over. Under the EU Accessibility Act, an accessibility statement is likewise expected of obligated businesses.",
    stmtOverlay: (vendor) =>
      `An accessibility overlay was detected (${vendor}). An overlay is not a substitute for a statement and does not make a site accessible — the FTC fined accessiBe $1,000,000 in January 2025 for marketing one as achieving WCAG compliance.`,
    clean: "No passive security findings on this site. That's a good sign — and only one part of the picture was checked here.",
    lockedMore: (n) => `${n} more findings remain, along with what to do about each one.`,
    lockedNone: "The full report also covers accessibility, performance and technical SEO.",
    cta: "Create an account and get the full report",
    checksTitle: "What gets checked",
    audienceTitle: "Who this is for",
    audienceA:
      "Small businesses, freelancers and anyone with a single website — people with no security vendor and nobody checking the site after it launched. Large companies are already covered; the gap is here.",
    audienceB:
      "Professionals who build websites can also attach their own human opinion to the report, so the client gets both the numbers and what to do about them.",
    ctaTitle: "One check, no credit card",
    ctaSignup: "Create an account",
    ctaLogin: "I already have an account",
    footerLive: "A live check, shared by every visitor",
    checks: [
      {
        title: "Accessibility",
        body:
          "Automated testing for the failures tools can catch — contrast, keyboard navigation, form labels and screen-reader names. In Israel this is also a legal exposure (standard 5568).",
      },
      {
        title: "Security",
        body:
          "Security headers, cookies, TLS certificate validity, HTTPS enforcement and mixed content. Passive only — the site is never touched.",
      },
      {
        title: "Performance",
        body: "Lighthouse on a real browser: Core Web Vitals, load time, and exactly what is slowing the page down.",
      },
      {
        title: "Technical SEO",
        body: "What stops Google from reading and ranking your pages — titles, descriptions, structure and linking.",
      },
    ],
  },

  severity: { critical: "Critical", serious: "Serious", moderate: "Moderate", minor: "Minor" },

  login: {
    title: "Log in",
    sub: "Good to see you again.",
    email: "Email",
    password: "Password",
    submit: "Log in",
    submitting: "Logging in...",
    noAccount: "Don't have an account yet?",
    signupLink: "Sign up",
    seoDesc: "Log in to MAGEN to scan your website and view performance, accessibility, SEO and security reports.",
  },

  signup: {
    title: "Create an account",
    sub: "Start scanning in under a minute — one site free, no credit card.",
    fullName: "Full name",
    email: "Email",
    howUse: "How will you use MAGEN?",
    ownerTitle: "I have a website",
    ownerHint: "Check and monitor my own site",
    proTitle: "I'm a professional",
    proHint: "I build or maintain sites for clients",
    yourSite: "Your own website address",
    yourSiteHint: "The site is added to your account so you can scan it. Its scan result is part of reviewing your request.",
    expertise: "Area of expertise (optional)",
    expertisePlaceholder: "e.g. WordPress development · digital accessibility",
    proNotice:
      "Professional accounts are reviewed by hand before you can write opinions on scans, and even after approval the first few opinions are read before they reach a client. Until then the account works normally — you can add sites and scan them.",
    password: "Password (at least 8 characters)",
    submit: "Create account",
    submitting: "Creating account...",
    haveAccount: "Already have an account?",
    loginLink: "Log in",
    seoDesc:
      "Create a MAGEN account and scan one site free — performance, accessibility, SEO and security. No credit card.",
  },

  publicScan: {
    reportLabel: "Website health report",
    scannedAt: (d) => `Checked on ${d}`,
    security: "Security",
    accessibility: "Accessibility",
    performance: "Performance",
    seo: "SEO",
    findingsTitle: "Top findings",
    more: (n) => `And ${n} more findings in the full report.`,
    ctaTitle: "Want to know how your own site is doing?",
    ctaBody: "This report was produced with MAGEN. First check is free.",
    ctaBtn: "Check my site",
    notFoundTitle: "Result not found",
    newScan: "Check a new site",
    loading: "Loading…",
    seoTitle: (host) => `Website health for ${host}`,
    seoDesc: (host, date) =>
      `MAGEN scan results for ${host} — accessibility, security, performance and SEO. Checked on ${date}.`,
  },
};

const DICTS = { he, en };

export function dictFor(lang) {
  return DICTS[lang] || DICTS[DEFAULT_LANG];
}
