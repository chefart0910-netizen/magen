// בדיקה עצמית לגלאי הצהרת הנגישות.
// ==========================================================================================
// למה זה קיים: הסקר רץ על מאות אתרים בריצה של עשרות דקות, והגלאי הזה הוא גם פיצ'ר במוצר.
// באג בו מתגלה או באיחור גדול או, גרוע מזה, כמספר שגוי בדוח שמוצג למשקיע. לכן הוא נבדק
// כאן מול תשובות מבוימות - DNS ו-fetch מוחלפים - כך שאפשר לכסות גם מצבים שקשה לייצר
// באתר אמיתי: הפניה, 404, תשובה שאינה HTML, הצהרה בלי טלפון.
//
// הרצה: node scripts/market-study/self-test.js

const dns = require("node:dns").promises;

// כל שם מארח בבדיקות מתרגם לכתובת ציבורית תקינה, אחרת שער ה-SSRF יפסול אותו עוד לפני
// ה-fetch המבוים.
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];

const pages = new Map();
function page(url, { status = 200, html = "", type = "text/html", location = null } = {}) {
  pages.set(url, { status, html, type, location });
}

global.fetch = async (url) => {
  const key = String(url);
  const entry = pages.get(key);
  if (!entry) {
    return makeResponse({ status: 404, html: "not found" });
  }
  return makeResponse(entry);
};

function makeResponse({ status, html, type, location }) {
  const headers = new Map([["content-type", type || "text/html"]]);
  if (location) headers.set("location", location);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (k) => headers.get(String(k).toLowerCase()) || null,
      forEach: (fn) => headers.forEach((v, k) => fn(v, k)),
    },
    text: async () => html,
  };
}

const { checkAccessibilityStatement } = require("../../lib/services/accessibility-statement");

const STATEMENT_BODY = (contact) => `
<html><body><h1>הצהרת נגישות</h1>
<p>${"אתר זה פועל בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע\"ג-2013, ובהתאם לתקן הישראלי ת\"י 5568. ".repeat(6)}</p>
<p>${"נעשו התאמות ניווט מקלדת, ניגודיות וטקסט חלופי לתמונות. ".repeat(6)}</p>
${contact ? '<p>רכז הנגישות: ישראל ישראלי, דוא"ל access@shop.co.il, טלפון 03-5551234</p>' : "<p>נשמח לקבל פניות.</p>"}
</body></html>`;

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("אתר עם הצהרה מלאה ופרטי קשר -> statement_contact", async () => {
  pages.clear();
  page("https://a.co.il/", { html: '<a href="/accessibility">הצהרת נגישות</a>' });
  page("https://a.co.il/accessibility", { html: STATEMENT_BODY(true) });
  const r = await checkAccessibilityStatement("https://a.co.il/");
  assert(r.status === "statement_contact", `קיבלנו ${r.status}`);
  assert(r.details.has_contact === true, "פרטי קשר לא זוהו");
  assert(r.details.names_coordinator === true, "רכז נגישות לא זוהה");
  assert(r.details.mentions_standard === true, "אזכור התקן לא זוהה");
});

test("הצהרה בלי דוא\"ל וטלפון -> statement", async () => {
  pages.clear();
  page("https://b.co.il/", { html: '<a href="/negishut">נגישות</a>' });
  page("https://b.co.il/negishut", { html: STATEMENT_BODY(false) });
  const r = await checkAccessibilityStatement("https://b.co.il/");
  assert(r.status === "statement", `קיבלנו ${r.status}`);
  assert(r.details.has_contact === false, "זוהו פרטי קשר שלא קיימים");
});

test("אין שום אזכור נגישות -> none", async () => {
  pages.clear();
  page("https://c.co.il/", { html: "<a href='/about'>אודות</a><a href='/contact'>צור קשר</a>" });
  const r = await checkAccessibilityStatement("https://c.co.il/");
  assert(r.status === "none", `קיבלנו ${r.status}`);
});

test("קישור שמוביל ל-404 -> link_only", async () => {
  pages.clear();
  page("https://d.co.il/", { html: '<a href="/accessibility-statement">הצהרת נגישות</a>' });
  const r = await checkAccessibilityStatement("https://d.co.il/");
  assert(r.status === "link_only", `קיבלנו ${r.status}`);
  assert(r.statement_url === "https://d.co.il/accessibility-statement", "כתובת הקישור לא נשמרה");
});

test("המילה 'נגישות' בתפריט בלבד אינה הצהרה -> link_only", async () => {
  pages.clear();
  page("https://e.co.il/", { html: '<a href="/accessibility">נגישות</a>' });
  page("https://e.co.il/accessibility", { html: "<html><body>נגישות</body></html>" });
  const r = await checkAccessibilityStatement("https://e.co.il/");
  assert(r.status === "link_only", `קיבלנו ${r.status}`);
});

test("הצהרה בנתיב מקובל בלי קישור מעמוד הבית -> נמצאת", async () => {
  pages.clear();
  page("https://f.co.il/", { html: "<p>ברוכים הבאים</p>" });
  page("https://f.co.il/accessibility", { html: STATEMENT_BODY(true) });
  const r = await checkAccessibilityStatement("https://f.co.il/");
  assert(r.status === "statement_contact", `קיבלנו ${r.status}`);
});

test("זיהוי ווידג'ט accessiBe", async () => {
  pages.clear();
  page("https://g.co.il/", { html: '<script src="https://acsbapp.com/apps/app/dist/js/app.js"></script>' });
  const r = await checkAccessibilityStatement("https://g.co.il/");
  assert(r.overlay === "accessiBe", `קיבלנו ${r.overlay}`);
  assert(r.status === "none", "ווידג'ט אינו אמור להיחשב כהצהרה");
});

test("אתר שלא עונה -> unreachable ולא קריסה", async () => {
  pages.clear();
  const r = await checkAccessibilityStatement("https://h.co.il/");
  assert(r.status === "unreachable", `קיבלנו ${r.status}`);
  assert(r.error, "לא נרשמה שגיאה");
});

test("תשובה שאינה HTML -> unreachable", async () => {
  pages.clear();
  page("https://i.co.il/", { html: "{}", type: "application/json" });
  const r = await checkAccessibilityStatement("https://i.co.il/");
  assert(r.status === "unreachable", `קיבלנו ${r.status}`);
});

test("הפניה לעמוד ההצהרה נעקבת", async () => {
  pages.clear();
  page("https://j.co.il/", { html: '<a href="/accessibility">הצהרת נגישות</a>' });
  page("https://j.co.il/accessibility", { status: 301, location: "https://j.co.il/legal/a11y" });
  page("https://j.co.il/legal/a11y", { html: STATEMENT_BODY(true) });
  const r = await checkAccessibilityStatement("https://j.co.il/");
  assert(r.status === "statement_contact", `קיבלנו ${r.status}`);
  assert(r.statement_url === "https://j.co.il/legal/a11y", `כתובת סופית שגויה: ${r.statement_url}`);
});

test("קישור מוחלט לדומיין אחר נבדק ולא מפיל", async () => {
  pages.clear();
  page("https://k.co.il/", { html: '<a href="https://cdn.example.com/accessibility">הצהרת נגישות</a>' });
  page("https://cdn.example.com/accessibility", { html: STATEMENT_BODY(true) });
  const r = await checkAccessibilityStatement("https://k.co.il/");
  assert(r.status === "statement_contact", `קיבלנו ${r.status}`);
});

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${name}\n      ${err.message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} עברו`);
  process.exit(failed ? 1 : 0);
})();
