// MAGEN - scanner.js לפריסת Vercel: מריץ Lighthouse + axe-core דרך דפדפן Chrome מרוחק
// (Browserless.io) במקום Chrome מקומי - כי לפונקציית serverless אין בינארי דפדפן משלה.
// ==========================================================================================
// מתחברים לדפדפן קיים ורץ כבר (puppeteer.connect, לא puppeteer.launch) דרך WebSocket, ואז:
// - Lighthouse רץ במצב "puppeteer integration" (page כפרמטר רביעי, נתמך רשמית מ-v10+) -
//   לא צריך chrome-launcher/פורט debugging מקומי בכלל.
// - axe-core רץ על אותו page עצמו (@axe-core/puppeteer).
// רצים ברצף על אותו page (לא שני חיבורים מקבילים) - עקבי עם ההחלטה בגרסה המקורית (ראו
// backend/src/services/scanner.js) שהרצה מקבילה של שני מופעי Chrome גרמה לטיימאאוטים.

const puppeteer = require("puppeteer-core");
const { spawn } = require("child_process");
const { AxePuppeteer } = require("@axe-core/puppeteer");
const { enrichViolationWithGuidedFix } = require("./guided-fixes");

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
const BROWSERLESS_WS_URL =
  process.env.BROWSERLESS_WS_URL || "wss://production-sfo.browserless.io";

// לפונקציית Vercel יש תקרה קשיחה של 60 שניות (המקסימום בתוכנית Hobby). אם Lighthouse
// חורג ממנה, Vercel הורג את הפונקציה ומחזיר 504 - המשתמש מקבל שגיאה במקום דוח, ורשומת
// הסריקה נשארת תקועה במצב "running". לכן כל שלב מקבל תקציב זמן משלו: חריגה מסיימת את
// אותו שלב בלבד, והדוח חוזר עם מה שכן הספיק (בדיוק כמו כל כישלון חלקי אחר).
const LIGHTHOUSE_BUDGET_MS = Number(process.env.LIGHTHOUSE_BUDGET_MS || 45000);
// כמה מתוך 60 השניות של Vercel מותר לסריקה לצרוך. השארית היא מרווח לכתיבה ל-DB ולתשובה.
const SCAN_TOTAL_BUDGET_MS = Number(process.env.SCAN_TOTAL_BUDGET_MS || 52000);
const AXE_BUDGET_MS = Number(process.env.AXE_BUDGET_MS || 12000);

function withBudget(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} חרג מתקציב הזמן (${Math.round(ms / 1000)} שניות) והופסק`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// שני מצבי הרצה, אותו קוד סריקה בדיוק:
//   remote (ברירת המחדל) - Vercel serverless, שאין לו בינארי דפדפן, מתחבר ל-Browserless.
//   local  - runner של GitHub Actions, שבו Chrome כבר מותקן. אין שם מגבלת 60 שניות ואין
//            סיבוב רשת לדפדפן מרוחק, ולכן אתרי וורדפרס כבדים מסיימים בלי בעיה.
// הבחירה נעשית לפי SCAN_RUNNER, וכל השאר - Lighthouse, axe, החישוב והדוח - זהה.
const SCAN_RUNNER = process.env.SCAN_RUNNER || "remote";

const LOCAL_CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

function waitForDevtools(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return (async () => {
    for (;;) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) return (await res.json()).webSocketDebuggerUrl;
      } catch (err) {
        // הדפדפן עדיין עולה - ננסה שוב
      }
      if (Date.now() > deadline) throw new Error("Chrome המקומי לא ענה על פורט ה-debugging");
      await new Promise((r) => setTimeout(r, 250));
    }
  })();
}

async function launchLocalBrowser() {
  const fs = require("fs");
  const binary = LOCAL_CHROME_CANDIDATES.find((c) => {
    try { return fs.existsSync(c); } catch { return false; }
  });
  if (!binary) {
    throw new Error(
      `לא נמצא Chrome מקומי. נוסו: ${LOCAL_CHROME_CANDIDATES.join(", ")}. אפשר להגדיר CHROME_PATH.`
    );
  }
  const port = Number(process.env.CHROME_DEBUG_PORT || 9222);
  const child = spawn(
    binary,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${process.env.CHROME_USER_DATA_DIR || "/tmp/magen-chrome"}`,
    ],
    { stdio: "ignore", detached: false }
  );
  const wsEndpoint = await waitForDevtools(port);
  const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
  browser.__magenChild = child;
  return browser;
}

async function connectBrowser() {
  if (SCAN_RUNNER === "local") return launchLocalBrowser();

  if (!BROWSERLESS_API_KEY) {
    throw new Error(
      "BROWSERLESS_API_KEY לא מוגדר - נדרש כדי להריץ סריקת Lighthouse/axe-core אמיתית בסביבת serverless (ראו Project Settings -> Environment Variables ב-Vercel)."
    );
  }
  return puppeteer.connect({
    browserWSEndpoint: `${BROWSERLESS_WS_URL}?token=${BROWSERLESS_API_KEY}`,
  });
}

async function runLighthouse(page, url) {
  // ייבוא דינמי כי lighthouse הוא ESM-only בגרסאות חדשות
  const lighthouse = (await import("lighthouse")).default;
  const lhResult = await lighthouse(
    url,
    {
      logLevel: "error",
      // הקטגוריה "accessibility" של Lighthouse מריצה בעצמה את מלוא חוקי axe-core - בדיוק
      // מה ש-runAxeAccessibility עושה כאן שורה אחת אחר כך. הרצנו את אותה עבודה פעמיים
      // וגם הצגנו שני ציוני נגישות שונים למשתמש. הציון המשוקלל שלנו הוא המקור היחיד.
      onlyCategories: ["performance", "best-practices", "seo"],
      // קובעים locale קשיח - בלי זה Lighthouse מנסה לזהות locale מהדפדפן המרוחק
      // (Browserless), שלעיתים מחזיר ar/he וכו', ומנסה לטעון locales/<lang>.json.
      // ב-build של Vercel קבצי ה-locale נטענים דינמית ולכן לא כל השפות "נתפסות"
      // ע"י ה-tracer (@vercel/nft) ומועלות לפונקציה - מה שגורם ל-ENOENT בזמן ריצה.
      locale: "en-US",
      // צילום העמוד המלא הוא מהגוזלים הגדולים ביותר ואינו משפיע על אף ציון שאנחנו מציגים.
      disableFullPageScreenshot: true,
      skipAudits: ["screenshot-thumbnails", "final-screenshot"],
      // ברירת המחדל היא המתנה של 45 שניות לטעינה - לבדה זה כמעט כל התקציב שלנו.
      maxWaitForLoad: 22000,
      maxWaitForFcp: 15000,
    },
    undefined,
    page
  );

  const lhr = lhResult.lhr;

  // Lighthouse מחזיר score = null כשקטגוריה לא הצליחה להימדד (למשל NO_FCP באתר איטי).
  // הקוד הקודם עשה `|| 0` והציג ללקוח "0" כאילו זו מדידה אמיתית - כלומר אמר לעסק
  // שהאתר שלו מקבל אפס, כשבפועל פשוט לא היתה מדידה. null עובר נכון גם למסד וגם למסך.
  const categoryScore = (key) => {
    const value = lhr.categories[key]?.score;
    return typeof value === "number" ? Math.round(value * 100) : null;
  };

  return {
    performance: categoryScore("performance"),
    best_practices: categoryScore("best-practices"),
    seo: categoryScore("seo"),
    core_web_vitals: {
      first_contentful_paint: lhr.audits["first-contentful-paint"]?.displayValue,
      largest_contentful_paint: lhr.audits["largest-contentful-paint"]?.displayValue,
      total_blocking_time: lhr.audits["total-blocking-time"]?.displayValue,
      cumulative_layout_shift: lhr.audits["cumulative-layout-shift"]?.displayValue,
    },
  };
}

async function runAxeAccessibility(page, url) {
  // אתרים עם polling או צ'אט חי לעולם לא מגיעים ל-networkidle, ואז ה-goto תוקע את כל
  // התקציב. מנסים המתנה "נקייה" קצרה, ואם היא לא מגיעה - ממשיכים עם מה שנטען בפועל.
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 12000 });
  } catch (err) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
  }
  const axeResults = await new AxePuppeteer(page).analyze();

  const violations = axeResults.violations.map((v) =>
    enrichViolationWithGuidedFix({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help_url: v.helpUrl,
      nodes_affected: v.nodes.length,
    })
  );

  return {
    violations_count: violations.length,
    violations,
    passes_count: axeResults.passes.length,
  };
}

// ציון הנגישות.
//
// הנוסחה הקודמת היתה weight * nodes_affected בלי תקרה, וזה איפס כמעט כל אתר אמיתי:
// ליקוי "חמור" אחד על 15 רכיבים (למשל אותו כפתור ללא שם שחוזר בתפריט) הגיע ל-105
// נקודות עונש, וליקוי ניגודיות בודד שחוזר על 40 טקסטים - ל-120. כלומר הציון היה 0
// גם לאתר סביר וגם לאתר נטוש, ולא נשא שום מידע - וזה המספר שנמכר ללקוח.
//
// התיקון: חומרת *סוג* הליקוי היא העיקר, וחזרתיות מוסיפה מעט. לכן כל כלל תורם את
// משקלו פעם אחת, ועוד תוספת ממותנת לפי מספר הרכיבים - עם תקרה של פי 2.5 מהמשקל.
// כך ליקוי אחד שחוזר הרבה כבד מליקוי בודד, אבל אינו מוחק את כל הציון לבדו.
const A11Y_WEIGHTS = { minor: 1, moderate: 3, serious: 7, critical: 12 };
const A11Y_REPEAT_CAP = 2.5;

// תקרת עונש לכל דרגת חומרה. זה מה שמונע מדרגה אחת למחוק את כל הציון לבדה, ובזכותו
// שיפור נראה מיד: ברגע שהקטגוריה יורדת מתחת לתקרה שלה, הציון עולה.
const A11Y_CLASS_CAP = { critical: 40, serious: 25, moderate: 25, minor: 10 };

function violationPenalty(violation) {
  const weight = A11Y_WEIGHTS[violation.impact] || A11Y_WEIGHTS.moderate;
  const nodes = Number(violation.nodes_affected);
  const safeNodes = Number.isFinite(nodes) && nodes > 0 ? nodes : 1;
  // log2 כדי שהעלייה תישחק: 1 רכיב -> פי 1, 4 רכיבים -> פי 1.6, 32 -> פי 2.25.
  const repeatFactor = Math.min(A11Y_REPEAT_CAP, 1 + Math.log2(safeNodes) / 4.8);
  return weight * repeatFactor;
}

function computeAccessibilityScore(axeResult) {
  const perClass = {};
  for (const violation of axeResult?.violations || []) {
    const impact = A11Y_WEIGHTS[violation.impact] ? violation.impact : "moderate";
    perClass[impact] = (perClass[impact] || 0) + violationPenalty(violation);
  }

  let penalty = 0;
  for (const [impact, raw] of Object.entries(perClass)) {
    penalty += Math.min(A11Y_CLASS_CAP[impact], raw);
  }
  return Math.max(0, Math.round(100 - penalty));
}

async function runFullScan(url) {
  const startedAt = Date.now();
  let browser;
  const errors = [];
  let lighthouse = null;
  let axe = null;

  try {
    browser = await connectBrowser();
    const page = await browser.newPage();

    // הסדר חשוב: axe רץ ראשון כי הוא מהיר וכמעט תמיד מצליח, ולכן הוא מבטיח שיהיה מה
    // להציג. Lighthouse - האיטי והשברירי מביניהם - מקבל אחריו את *כל* מה שנשאר מהתקציב
    // במקום מכסה קבועה. באתר קל זה יותר ממה שהוא צריך; באתר כבד זה ההבדל בין ציון ביצועים
    // לבין מקף.
    try {
      axe = await withBudget(runAxeAccessibility(page, url), AXE_BUDGET_MS, "בדיקת הנגישות");
    } catch (err) {
      errors.push(`axe-core: ${err.message || err}`);
    }

    const remainingMs = SCAN_TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remainingMs < 8000) {
      errors.push("lighthouse: לא נותר מספיק זמן לבדיקת הביצועים לאחר בדיקת הנגישות");
    } else {
      try {
        lighthouse = await withBudget(
          runLighthouse(page, url),
          Math.min(LIGHTHOUSE_BUDGET_MS, remainingMs),
          "בדיקת הביצועים"
        );
      } catch (err) {
        errors.push(`lighthouse: ${err.message || err}`);
      }
    }
  } catch (err) {
    // כשלון חיבור לדפדפן המרוחק - שני הבדיקות נופלות עם אותה שגיאה ברורה.
    errors.push(`lighthouse: ${err.message || err}`, `axe-core: ${err.message || err}`);
  } finally {
    // browser.close() היה סוגר את הסשן ב-Browserless; disconnect() משחרר רק את החיבור שלנו.
    if (browser) {
      try {
        await browser.close();
      } catch (cleanupErr) {
        // ניקוי שנכשל לא אמור להפיל את תוצאת הסריקה עצמה.
      }
      // ב-Chrome מקומי שהרמנו בעצמנו, disconnect לבדו משאיר תהליך יתום.
      if (browser.__magenChild) {
        try { browser.__magenChild.kill(); } catch (killErr) { /* התהליך כבר מת */ }
      }
    }
  }

  return {
    url,
    scanned_at: new Date().toISOString(),
    lighthouse,
    accessibility: axe ? { ...axe, computed_score: computeAccessibilityScore(axe) } : null,
    errors,
  };
}

// מגביל את הדוח לגרסה חלקית (חבילה חינמית - סעיף 5 במפרט) - הציון עצמו אמיתי, רק פירוט
// הממצאים ננעל, ומסומן בבירור partial:true.
function toPartialReport(fullResult) {
  const topViolation = fullResult.accessibility?.violations?.[0];
  return {
    ...fullResult,
    partial: true,
    lighthouse: fullResult.lighthouse
      ? {
          performance: fullResult.lighthouse.performance,
          best_practices: fullResult.lighthouse.best_practices,
          seo: fullResult.lighthouse.seo,
          core_web_vitals: null,
        }
      : null,
    accessibility: fullResult.accessibility
      ? {
          computed_score: fullResult.accessibility.computed_score,
          violations_count: fullResult.accessibility.violations_count,
          passes_count: fullResult.accessibility.passes_count,
          violations: topViolation ? [{ ...topViolation, locked: false }] : [],
          locked_violations_count: Math.max(
            0,
            (fullResult.accessibility.violations_count || 0) - (topViolation ? 1 : 0)
          ),
        }
      : null,
  };
}

module.exports = {
  computeAccessibilityScore, runFullScan, toPartialReport };
