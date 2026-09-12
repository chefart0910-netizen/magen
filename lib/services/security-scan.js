// MAGEN - security-scan.js: סריקת אבטחה פסיבית, ללא תשתית חיצונית.
// ==========================================================================================
// זו סריקה פסיבית בלבד - שקולה למה ש-`zap-baseline.py` מדווח: קריאת כותרות תגובה, cookies,
// תעודת TLS, ובדיקת נתיבים חשופים ידועים. אין כאן שום ניצול פרצות (exploitation), אין fuzzing
// ואין שינוי מצב באתר הנבדק - בדיוק כמו axe-core/Lighthouse, רק בשביל אבטחה.
//
// למה לא ZAP: ZAP דורש קונטיינר Java רץ עם ~2GB RAM. לפונקציית serverless אין כזה, ולכן
// הבדיקה מומשה ישירות כאן. מה שלא ניתן לבדוק פסיבית (SQLi, XSS אקטיבי) לא מדומה כאן -
// הוא פשוט לא נכלל בדוח, ראו services/pentest-client.js.

const tls = require("node:tls");

const UA = "MagenSecurityScanner/1.0 (+https://magen-pi.vercel.app)";
const TIMEOUT_MS = 8000;

const WEIGHTS = { critical: 25, serious: 15, moderate: 8, minor: 3 };

// נתיבים שחשיפתם מדליפה מידע רגיש. לכל נתיב יש "חתימה" - סימן שהתוכן באמת מה שאנחנו
// מחפשים ולא דף 404 מותאם או fallback של SPA שמחזיר 200 על כל כתובת (בעיה נפוצה מאוד
// שגורמת ל-false positives בסורקים נאיביים).
const EXPOSED_PATHS = [
  { path: "/.git/HEAD", signature: (t) => /^ref:\s/.test(t.trim()), label: "מאגר Git", severity: "critical" },
  { path: "/.env", signature: (t) => /^[A-Z0-9_]+=/m.test(t) && !/<html/i.test(t), label: "קובץ סביבה (.env)", severity: "critical" },
  { path: "/.DS_Store", signature: (t) => t.includes("Bud1") || t.charCodeAt(0) === 0, label: "קובץ .DS_Store", severity: "minor" },
  { path: "/wp-config.php.bak", signature: (t) => /DB_PASSWORD|DB_NAME/.test(t), label: "גיבוי wp-config", severity: "critical" },
  { path: "/server-status", signature: (t) => /Apache Server Status/i.test(t), label: "Apache server-status", severity: "moderate" },
  { path: "/phpinfo.php", signature: (t) => /phpinfo\(\)|PHP Version/i.test(t), label: "phpinfo", severity: "serious" },
  { path: "/.svn/entries", signature: (t) => /^\d+\s/.test(t.trim()), label: "מאגר SVN", severity: "serious" },
];

function withTimeout(ms) {
  return AbortSignal.timeout(ms);
}

async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: withTimeout(TIMEOUT_MS),
      ...options,
    });
    return res;
  } catch (err) {
    return null;
  }
}

// --- TLS ---------------------------------------------------------------------------------

// קורא את תעודת השרת ישירות דרך socket TLS. fetch לא חושף את התעודה, ולכן זו הדרך היחידה
// לדעת מתי היא פגה - וזו אחת התקלות שהכי מפילות אתרים בפועל.
function inspectCertificate(hostname, port = 443) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };

    // rejectUnauthorized:false בכוונה: תעודה פגה או חתומה-עצמית היא בדיוק הממצא שאנחנו רוצים
    // לדווח עליו. עם ברירת המחדל החיבור היה נכשל ולא היינו יכולים לקרוא את התעודה בכלל.
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, timeout: TIMEOUT_MS, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        const protocol = socket.getProtocol();
        const authorized = socket.authorized;
        const authorizationError = socket.authorizationError ? String(socket.authorizationError) : null;
        socket.end();
        if (!cert || !cert.valid_to) return done(null);
        const validTo = new Date(cert.valid_to);
        done({
          issuer: cert.issuer?.O || cert.issuer?.CN || null,
          subject: cert.subject?.CN || null,
          valid_from: cert.valid_from || null,
          valid_to: cert.valid_to,
          days_remaining: Math.floor((validTo - Date.now()) / 86400000),
          protocol,
          authorized,
          authorization_error: authorizationError,
        });
      }
    );
    socket.on("error", () => done(null));
    socket.on("timeout", () => { socket.destroy(); done(null); });
  });
}

// --- כותרות אבטחה ------------------------------------------------------------------------

function checkCsp(value, add) {
  if (!value) {
    return add("csp-missing", "serious", "אין Content-Security-Policy",
      "ללא CSP הדפדפן יריץ כל סקריפט שיוזרק לעמוד - זו ההגנה המרכזית מפני XSS.",
      "הוסיפו כותרת Content-Security-Policy. התחילו במצב דיווח בלבד: Content-Security-Policy-Report-Only: default-src 'self'", "CSP");
  }
  const v = value.toLowerCase();
  if (/(^|;)\s*default-src[^;]*\*/.test(v) || /(^|;)\s*script-src[^;]*\*/.test(v)) {
    add("csp-wildcard", "serious", "CSP מכיל תו כללי (*)",
      "מקור כללי מבטל את רוב ההגנה של ה-CSP - כל דומיין יכול להריץ קוד.",
      "החליפו את ה-* ברשימת דומיינים מפורשת.", "CSP");
  }
  if (v.includes("'unsafe-inline'")) {
    add("csp-unsafe-inline", "moderate", "CSP מתיר 'unsafe-inline'",
      "סקריפטים inline מותרים, ולכן הזרקת קוד לתוך ה-HTML עדיין תרוץ.",
      "השתמשו ב-nonce או hash לכל סקריפט inline במקום 'unsafe-inline'.", "CSP");
  }
  if (v.includes("'unsafe-eval'")) {
    add("csp-unsafe-eval", "moderate", "CSP מתיר 'unsafe-eval'",
      "eval() ודומיו מותרים - נתיב נפוץ להרצת קוד שהוזרק.",
      "הסירו 'unsafe-eval' ואתרו את הספרייה שדורשת אותו.", "CSP");
  }
  return null;
}

function checkHsts(value, isHttps, add) {
  if (!isHttps) return;
  if (!value) {
    return add("hsts-missing", "serious", "אין Strict-Transport-Security",
      "ללא HSTS, גולש שמקליד את הכתובת בלי https נחשף להתקפת downgrade לפני ההפניה.",
      "הוסיפו: Strict-Transport-Security: max-age=31536000; includeSubDomains", "HSTS");
  }
  const maxAge = Number((value.match(/max-age=(\d+)/i) || [])[1] || 0);
  if (maxAge < 15552000) {
    add("hsts-short", "moderate", `max-age של HSTS קצר מדי (${maxAge} שניות)`,
      "תקופה קצרה מדי מצמצמת מאוד את ההגנה. המומלץ הוא לפחות חצי שנה.",
      "עדכנו ל-max-age=31536000 (שנה).", "HSTS");
  }
  if (!/includesubdomains/i.test(value)) {
    add("hsts-no-subdomains", "minor", "HSTS לא כולל תת-דומיינים",
      "תת-דומיינים לא מוגנים, וניתן לתקוף דרכם.",
      "הוסיפו includeSubDomains לכותרת - רק אחרי שווידאתם שכל תת-הדומיינים תומכים ב-HTTPS.", "HSTS");
  }
}

const SIMPLE_HEADERS = [
  { header: "x-content-type-options", id: "xcto-missing", severity: "moderate",
    expect: (v) => v && v.toLowerCase().trim() === "nosniff",
    title: "אין X-Content-Type-Options: nosniff",
    why: "הדפדפן עלול לנחש סוג תוכן ולהריץ קובץ שהועלה כאילו היה סקריפט.",
    fix: "הוסיפו: X-Content-Type-Options: nosniff" },
  { header: "referrer-policy", id: "referrer-missing", severity: "minor",
    expect: (v) => !!v,
    title: "אין Referrer-Policy",
    why: "כתובות מלאות (שעשויות להכיל מזהים או טוקנים) נשלחות לאתרים חיצוניים.",
    fix: "הוסיפו: Referrer-Policy: strict-origin-when-cross-origin" },
];

function checkFraming(headers, cspValue, add) {
  const xfo = headers["x-frame-options"];
  const hasFrameAncestors = cspValue && /frame-ancestors/i.test(cspValue);
  if (!xfo && !hasFrameAncestors) {
    add("clickjacking", "serious", "אין הגנה מפני clickjacking",
      "אפשר להטמיע את האתר ב-iframe באתר זר ולגרום לגולשים ללחוץ על דברים בלי לדעת.",
      "הוסיפו frame-ancestors 'self' ל-CSP (או X-Frame-Options: SAMEORIGIN לדפדפנים ישנים).", "Clickjacking");
  }
}

function checkCors(headers, add) {
  const acao = headers["access-control-allow-origin"];
  const acac = headers["access-control-allow-credentials"];
  if (acao === "*" && acac && acac.toLowerCase() === "true") {
    add("cors-credentials-wildcard", "critical", "CORS פתוח לרווחה יחד עם credentials",
      "כל אתר יכול לקרוא תשובות מאומתות בשם הגולש - דליפת מידע ישירה.",
      "החליפו את ה-* ברשימת מקורות מותרים מפורשת.", "CORS");
  } else if (acao === "*") {
    add("cors-wildcard", "minor", "CORS פתוח לכל מקור (*)",
      "כל אתר יכול לקרוא תשובות מה-API. תקין לתוכן ציבורי, מסוכן לכל דבר אחר.",
      "אם התוכן אינו ציבורי - החליפו ברשימת מקורות מפורשת.", "CORS");
  }
}

// --- Cookies -----------------------------------------------------------------------------

function parseCookies(setCookieHeaders, isHttps, add) {
  const cookies = [];
  for (const raw of setCookieHeaders) {
    const name = raw.split("=")[0].trim();
    const lower = raw.toLowerCase();
    const issues = [];
    const secure = lower.includes("; secure") || lower.endsWith("; secure");
    const httpOnly = /;\s*httponly/.test(lower);
    const sameSite = (raw.match(/;\s*samesite=([^;]+)/i) || [])[1]?.trim() || null;

    if (isHttps && !secure) issues.push("חסר Secure");
    if (!httpOnly) issues.push("חסר HttpOnly");
    if (!sameSite) issues.push("חסר SameSite");
    cookies.push({ name, secure, http_only: httpOnly, same_site: sameSite, issues });
  }
  const bad = cookies.filter((c) => c.issues.length > 0);
  if (bad.length > 0) {
    add("cookie-flags", "moderate", `${bad.length} cookies בלי דגלי אבטחה מלאים`,
      "cookie בלי HttpOnly נגיש ל-JavaScript ולכן נגנב ב-XSS; בלי Secure הוא נשלח גם ב-HTTP; בלי SameSite הוא נשלח בבקשות חוצות-אתר (CSRF).",
      "הוסיפו Secure; HttpOnly; SameSite=Lax לכל cookie שאינו נדרש ל-JavaScript.", "Cookies",
      bad.map((c) => `${c.name}: ${c.issues.join(", ")}`).join(" | "));
  }
  return cookies;
}

// --- HTML: mixed content ו-SRI -------------------------------------------------------------

function inspectHtml(html, isHttps, add) {
  const result = { mixed_content: [], external_scripts_without_sri: [] };
  if (!html) return result;

  if (isHttps) {
    const mixed = [...html.matchAll(/(?:src|href)\s*=\s*["'](http:\/\/[^"']+)["']/gi)].map((m) => m[1]);
    result.mixed_content = [...new Set(mixed)].slice(0, 20);
    if (result.mixed_content.length > 0) {
      add("mixed-content", "serious", `${result.mixed_content.length} משאבים נטענים ב-HTTP בעמוד HTTPS`,
        "דפדפנים חוסמים או מזהירים על תוכן מעורב, והמשאבים האלה ניתנים לשינוי בדרך.",
        "החליפו את כל הכתובות ל-https:// (או לנתיב יחסי).", "Mixed Content",
        result.mixed_content.slice(0, 5).join(" | "));
    }
  }

  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi)];
  const noSri = scripts.filter((m) => !/\bintegrity\s*=/i.test(m[0])).map((m) => m[1]);
  result.external_scripts_without_sri = [...new Set(noSri)].slice(0, 20);
  if (result.external_scripts_without_sri.length > 0) {
    add("sri-missing", "minor", `${result.external_scripts_without_sri.length} סקריפטים חיצוניים בלי Subresource Integrity`,
      "אם ה-CDN שמארח אותם נפרץ, הקוד שירוץ באתר שלכם ישתנה בלי שתדעו.",
      "הוסיפו integrity=\"sha384-...\" crossorigin=\"anonymous\" לתגיות ה-script החיצוניות.", "SRI",
      result.external_scripts_without_sri.slice(0, 5).join(" | "));
  }
  return result;
}

// --- HTTPS enforcement ---------------------------------------------------------------------

async function checkHttpsRedirect(hostname, port, add) {
  // רלוונטי רק לאתר שמוגש על הפורט הרגיל - אחרת אין "אותה כתובת ב-HTTP" להשוות אליה.
  if (port) return { reachable: false, enforced: null, not_applicable: true };
  const res = await safeFetch(`http://${hostname}/`);
  if (!res) return { reachable: false, enforced: null };
  const location = res.headers.get("location") || "";
  const enforced = res.status >= 300 && res.status < 400 && location.toLowerCase().startsWith("https://");
  if (!enforced) {
    add("no-https-redirect", "serious", "HTTP לא מופנה ל-HTTPS",
      "גולש שמגיע ב-HTTP נשאר בחיבור לא מוצפן, וכל מה שהוא שולח נחשף.",
      "הגדירו הפניה 301 מכל בקשת HTTP לכתובת ה-HTTPS המקבילה.", "HTTPS");
  }
  return { reachable: true, enforced, status: res.status, location: location || null };
}

// --- נתיבים חשופים ---------------------------------------------------------------------------

async function checkExposedPaths(origin, add) {
  const found = [];
  await Promise.all(EXPOSED_PATHS.map(async (entry) => {
    const res = await safeFetch(origin + entry.path, { redirect: "follow" });
    if (!res || res.status !== 200) return;
    let body = "";
    try { body = (await res.text()).slice(0, 2048); } catch { return; }
    // החתימה היא מה שמונע false positive מ-SPA שמחזיר 200 + index.html על כל נתיב.
    if (!entry.signature(body)) return;
    found.push({ path: entry.path, label: entry.label });
    add(`exposed${entry.path.replace(/[^a-z]/gi, "-")}`, entry.severity, `${entry.label} חשוף לציבור`,
      `הכתובת ${entry.path} מחזירה תוכן אמיתי לכל מי שמבקש אותה.`,
      `חסמו את הנתיב ${entry.path} בשרת האינטרנט, והסירו את הקובץ מהשרת.`, "Information Disclosure");
  }));
  return found;
}

// --- ציון ודירוג -------------------------------------------------------------------------

function grade(score) {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

// --- הסריקה עצמה -------------------------------------------------------------------------

// probeExposedPaths=false מכבה את בדיקת הנתיבים הניחושיים (.git, .env, wp-config.php.bak
// וכו'). הבדיקה הזו נכונה על אתר שהמשתמש הוכיח שהוא שלו, אבל על אתר של אדם זר - ובמיוחד
// מנתיב ציבורי אנונימי - סדרת בקשות לנתיבים כאלה נראית בלוג של אותו אתר כמו חיפוש פרצות
// ולא כמו ביקור. שאר הבדיקות כאן פסיביות לחלוטין: הן קוראות רק את מה שהאתר מחזיר לכל
// גולש בעמוד הבית, בדיוק כמו דפדפן.
async function runSecurityScan(rawUrl, { probeExposedPaths = true } = {}) {
  const url = new URL(rawUrl);
  const isHttps = url.protocol === "https:";
  const findings = [];
  const add = (id, severity, title, why, fix, category, evidence = null) => {
    findings.push({ id, severity, title, description: why,
      guided_fix: { summary: title, fix, category }, evidence });
    return null;
  };

  const res = await safeFetch(url.toString(), { redirect: "follow" });
  if (!res) {
    throw new Error(`לא ניתן להגיע ל-${url.hostname} - האתר לא ענה בתוך ${TIMEOUT_MS / 1000} שניות.`);
  }

  const headers = {};
  res.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];

  let html = "";
  const contentType = headers["content-type"] || "";
  if (/text\/html/i.test(contentType)) {
    try { html = (await res.text()).slice(0, 500000); } catch { /* גוף לא קריא - לא קריטי */ }
  }

  const cspValue = headers["content-security-policy"] || null;
  checkCsp(cspValue, add);
  checkHsts(headers["strict-transport-security"], isHttps, add);
  checkFraming(headers, cspValue, add);
  checkCors(headers, add);
  for (const rule of SIMPLE_HEADERS) {
    if (!rule.expect(headers[rule.header])) {
      add(rule.id, rule.severity, rule.title, rule.why, rule.fix, "Headers");
    }
  }
  if (!isHttps) {
    add("no-https", "critical", "האתר לא מוגש ב-HTTPS",
      "כל התעבורה, כולל סיסמאות, עוברת בטקסט גלוי.",
      "התקינו תעודת TLS (Let's Encrypt חינמי) והפנו את כל התעבורה ל-HTTPS.", "HTTPS");
  }

  const cookies = parseCookies(setCookie, isHttps, add);
  const htmlFindings = inspectHtml(html, isHttps, add);

  const [certificate, httpsRedirect, exposed] = await Promise.all([
    isHttps ? inspectCertificate(url.hostname, url.port ? Number(url.port) : 443) : Promise.resolve(null),
    checkHttpsRedirect(url.hostname, url.port, add),
    probeExposedPaths ? checkExposedPaths(url.origin, add) : Promise.resolve(null),
  ]);

  if (certificate && certificate.authorized === false) {
    add("cert-untrusted", "critical", "תעודת ה-TLS אינה מהימנה",
      `הדפדפן ידחה את התעודה ויציג אזהרת אבטחה מלאה לפני שהגולש יראה את האתר (${certificate.authorization_error}).`,
      "התקינו תעודה מרשות מוכרת (Let's Encrypt חינמי) וודאו שכל שרשרת הביניים מוגשת.", "TLS");
  }

  if (certificate && certificate.days_remaining <= 14) {
    add("cert-expiring", certificate.days_remaining <= 0 ? "critical" : "serious",
      certificate.days_remaining <= 0 ? "תעודת ה-TLS פגה" : `תעודת ה-TLS פגה בעוד ${certificate.days_remaining} ימים`,
      "כשהתעודה פגה הדפדפן חוסם את האתר לחלוטין עם אזהרת אבטחה.",
      "חדשו את התעודה, ורצוי להגדיר חידוש אוטומטי (certbot / ההגדרות של הספק).", "TLS");
  }

  const penalty = findings.reduce((sum, f) => sum + (WEIGHTS[f.severity] || 3), 0);
  const score = Math.max(0, 100 - penalty);

  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    url: url.toString(),
    scanned_at: new Date().toISOString(),
    scan_kind: probeExposedPaths ? "passive" : "passive_headers_only",
    // האם נבדקו נתיבים חשופים. false אומר שהתמונה חלקית - לא שלא נמצא כלום.
    probed_exposed_paths: probeExposedPaths,
    score,
    grade: grade(score),
    findings_count: findings.length,
    findings,
    headers_present: Object.fromEntries(
      ["content-security-policy", "strict-transport-security", "x-content-type-options",
       "x-frame-options", "referrer-policy", "permissions-policy"]
        .map((h) => [h, headers[h] || null])
    ),
    certificate,
    https: httpsRedirect,
    cookies,
    exposed_paths: probeExposedPaths ? exposed : null,
    mixed_content: htmlFindings.mixed_content,
    external_scripts_without_sri: htmlFindings.external_scripts_without_sri,
  };
}

module.exports = { runSecurityScan };
