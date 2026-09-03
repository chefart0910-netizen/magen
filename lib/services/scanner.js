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
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      // קובעים locale קשיח - בלי זה Lighthouse מנסה לזהות locale מהדפדפן המרוחק
      // (Browserless), שלעיתים מחזיר ar/he וכו', ומנסה לטעון locales/<lang>.json.
      // ב-build של Vercel קבצי ה-locale נטענים דינמית ולכן לא כל השפות "נתפסות"
      // ע"י ה-tracer (@vercel/nft) ומועלות לפונקציה - מה שגורם ל-ENOENT בזמן ריצה.
      locale: "en-US",
    },
    undefined,
    page
  );

  const lhr = lhResult.lhr;
  return {
    performance: Math.round((lhr.categories.performance?.score || 0) * 100),
    accessibility_lighthouse: Math.round((lhr.categories.accessibility?.score || 0) * 100),
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
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
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
  let browser;
  const errors = [];
  let lighthouse = null;
  let axe = null;

  try {
    browser = await connectBrowser();
    const page = await browser.newPage();

    try {
      lighthouse = await runLighthouse(page, url);
    } catch (err) {
      errors.push(`lighthouse: ${err.message || err}`);
    }

    try {
      axe = await runAxeAccessibility(page, url);
    } catch (err) {
      errors.push(`axe-core: ${err.message || err}`);
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
          accessibility_lighthouse: fullResult.lighthouse.accessibility_lighthouse,
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
