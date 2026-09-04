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

async function connectBrowser() {
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
  return {
    performance: Math.round((lhr.categories.performance?.score || 0) * 100),
    best_practices: Math.round((lhr.categories["best-practices"]?.score || 0) * 100),
    seo: Math.round((lhr.categories.seo?.score || 0) * 100),
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

function computeAccessibilityScore(axeResult) {
  const weights = { minor: 1, moderate: 3, serious: 7, critical: 12 };
  const penalty = axeResult.violations.reduce(
    (sum, v) => sum + (weights[v.impact] || 2) * v.nodes_affected,
    0
  );
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

module.exports = { runFullScan, toPartialReport };
