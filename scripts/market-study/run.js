// MAGEN - מחקר שוק: מצב הנגישות של אתרי עסקים קטנים בישראל.
// ==========================================================================================
// מה זה ולמה: אין בישראל שום מחקר שמודד כמה אתרים ישראליים עומדים בדרישות הנגישות. חיפשנו
// ולא מצאנו - לא בלמ"ס, לא באיגוד האינטרנט, לא בנציבות. הנתון היחיד שמצוטט הוא WebAIM
// העולמי, שאינו מודד ישראל ואינו מודד את מה שבאמת נתבעים עליו כאן.
//
// הסקר הזה מודד את מה שכן נתבעים עליו: הצהרת נגישות לפי תקנה 35(ה). בפסק הדין של השופט
// עודד מאור (ת"א, ינואר 2024) נדחו שש בקשות אישור נגד קוסמטיקאית, שמאי, מספרה, קצב, חנות
// חיות וחנות צעצועים - כולן על הפרה טכנית מהסוג הזה. המדגם כאן נבנה בכוונה מאותם ענפים,
// כדי שהתוצאה תהיה ברת-השוואה לפסיקה.
//
// אתיקה, וזה לא עניין של פורמליות:
//   * כל הבדיקות פסיביות. הסקריפט מבקש את עמוד הבית ועוד עד שבעה עמודים שנראים כהצהרת
//     נגישות - בדיוק כמו גולש שמחפש את ההצהרה. אין ניחוש נתיבים רגישים, אין בדיקות
//     אקטיביות, אין ניסיון להתחבר לשום דבר.
//   * User-Agent מזהה את עצמו ומפנה לאתר, כדי שבעל אתר שרואה את זה בלוג ידע מי זה.
//   * יש השהיה בין אתרים ומקביליות נמוכה. אין כאן עומס על אף שרת.
//   * הפלט המצרפי הוא מה שמתפרסם. שמות אתרים ספציפיים נשארים בקובץ הגולמי ולא מתפרסמים,
//     כי המטרה היא למדוד תופעה ולא להצביע על עסקים.
//
// אותו קוד זיהוי (lib/services/accessibility-statement.js) הוא גם הפיצ'ר במוצר. הסקר
// אינו כלי חד-פעמי - הוא הרצה של המוצר על מדגם.

const fs = require("node:fs");
const path = require("node:path");
const { checkAccessibilityStatement } = require("../../lib/services/accessibility-statement");

const DOMAINS_PATH = path.join(__dirname, "domains.json");
const OUT_DIR = path.join(__dirname, "out");

// מקביליות נמוכה בכוונה: זה לא צריך להיות מהיר, זה צריך להיות מנומס.
const CONCURRENCY = Number(process.env.STUDY_CONCURRENCY || 4);
const DELAY_MS = Number(process.env.STUDY_DELAY_MS || 400);
const LIMIT = Number(process.env.STUDY_LIMIT || 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkOne(entry) {
  const started = Date.now();
  // מנסים https ואם אין - http. אתר שעובד רק ב-http הוא ממצא בפני עצמו.
  let result = await safeCheck(`https://${entry.domain}/`);
  let scheme = "https";
  if (result.status === "unreachable") {
    const viaHttp = await safeCheck(`http://${entry.domain}/`);
    if (viaHttp.status !== "unreachable") {
      result = viaHttp;
      scheme = "http";
    }
  }
  return {
    domain: entry.domain,
    category: entry.category,
    scheme,
    https_ok: scheme === "https",
    status: result.status,
    overlay: result.overlay,
    statement_url: result.statement_url,
    details: result.details,
    error: result.error,
    ms: Date.now() - started,
  };
}

async function safeCheck(url) {
  try {
    return await checkAccessibilityStatement(url);
  } catch (err) {
    return { status: "unreachable", overlay: null, statement_url: null, details: null, error: String(err?.message || err) };
  }
}

function roundRobin(list) {
  const groups = new Map();
  for (const d of list) {
    if (!groups.has(d.category)) groups.set(d.category, []);
    groups.get(d.category).push(d);
  }
  const queues = [...groups.values()];
  const out = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift());
  return out;
}

async function run() {
  const domains = JSON.parse(fs.readFileSync(DOMAINS_PATH, "utf8"));
  // טעימה (STUDY_LIMIT) נלקחת לסירוגין מכל הענפים, לא N הראשונים בקובץ - אחרת טעימה של
  // 20 יוצאת כולה מספרות וקוסמטיקאיות, והמספר שלה לא אומר כלום על השאר.
  const work = LIMIT ? roundRobin(domains).slice(0, LIMIT) : domains;
  console.log(`בודק ${work.length} אתרים, ${CONCURRENCY} במקביל...`);

  const results = [];
  let index = 0;

  async function worker(id) {
    while (index < work.length) {
      const mine = index++;
      const entry = work[mine];
      const res = await checkOne(entry);
      results.push(res);
      const flag = res.status === "unreachable" ? "!" : " ";
      console.log(
        `${flag}[${String(results.length).padStart(3)}/${work.length}] ${entry.domain.padEnd(32)} ${res.status}${res.overlay ? ` (${res.overlay})` : ""}`
      );
      await sleep(DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(OUT_DIR, `raw-${stamp}.json`), JSON.stringify(results, null, 2));

  const summary = summarise(results);
  fs.writeFileSync(path.join(OUT_DIR, `summary-${stamp}.json`), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `summary-${stamp}.md`), renderMarkdown(summary));
  console.log("\n" + renderMarkdown(summary));
}

function pct(n, of) {
  if (!of) return 0;
  return Math.round((n / of) * 1000) / 10;
}

function summarise(results) {
  const reached = results.filter((r) => r.status !== "unreachable");
  const unreachable = results.length - reached.length;

  const counts = { none: 0, link_only: 0, statement: 0, statement_contact: 0 };
  for (const r of reached) counts[r.status] = (counts[r.status] || 0) + 1;

  // מה שהתקנה דורשת: הצהרה *עם* פרטי התקשרות.
  const compliant = counts.statement_contact;
  const noStatementAtAll = counts.none;
  const partial = counts.link_only + counts.statement;

  const overlays = {};
  for (const r of reached) {
    if (r.overlay) overlays[r.overlay] = (overlays[r.overlay] || 0) + 1;
  }
  const withOverlay = reached.filter((r) => r.overlay).length;

  // צלב מעניין: כמה מאלה שקנו ווידג'ט בכל זאת חסרה להם ההצהרה שהתקנה דורשת.
  const overlayNoStatement = reached.filter((r) => r.overlay && r.status !== "statement_contact").length;

  const noHttps = reached.filter((r) => !r.https_ok).length;

  const mentionsStandard = reached.filter((r) => r.details?.mentions_standard).length;
  const namesCoordinator = reached.filter((r) => r.details?.names_coordinator).length;

  const byCategory = {};
  for (const r of reached) {
    const c = (byCategory[r.category] = byCategory[r.category] || { n: 0, compliant: 0, none: 0, overlay: 0 });
    c.n += 1;
    if (r.status === "statement_contact") c.compliant += 1;
    if (r.status === "none") c.none += 1;
    if (r.overlay) c.overlay += 1;
  }

  return {
    generated_at: new Date().toISOString(),
    sampled: results.length,
    reached: reached.length,
    unreachable,
    counts,
    headline: {
      compliant,
      compliant_pct: pct(compliant, reached.length),
      no_statement_at_all: noStatementAtAll,
      no_statement_pct: pct(noStatementAtAll, reached.length),
      partial,
      partial_pct: pct(partial, reached.length),
      not_compliant_pct: pct(reached.length - compliant, reached.length),
    },
    overlays: {
      total: withOverlay,
      pct: pct(withOverlay, reached.length),
      by_vendor: overlays,
      with_overlay_but_not_compliant: overlayNoStatement,
      with_overlay_but_not_compliant_pct: pct(overlayNoStatement, withOverlay),
    },
    quality: {
      mentions_standard: mentionsStandard,
      names_coordinator: namesCoordinator,
      names_coordinator_pct: pct(namesCoordinator, reached.length),
    },
    https: { no_https: noHttps, no_https_pct: pct(noHttps, reached.length) },
    by_category: byCategory,
  };
}

function renderMarkdown(s) {
  const lines = [];
  lines.push(`# מצב הנגישות של אתרי עסקים קטנים בישראל`);
  lines.push("");
  lines.push(`מדגם: **${s.sampled}** אתרים ב-${Object.keys(s.by_category).length} ענפים. נענו: **${s.reached}**. לא נענו: ${s.unreachable}.`);
  lines.push(`נבדק ב-${s.generated_at.slice(0, 10)} באמצעות MAGEN. כל הבדיקות פסיביות.`);
  lines.push("");
  lines.push(`## הממצא המרכזי - תקנה 35(ה)`);
  lines.push("");
  lines.push(`| | אתרים | שיעור |`);
  lines.push(`|---|---:|---:|`);
  lines.push(`| **הצהרת נגישות עם פרטי התקשרות** (מה שהתקנה דורשת) | ${s.headline.compliant} | **${s.headline.compliant_pct}%** |`);
  lines.push(`| הצהרה חלקית או קישור בלבד | ${s.headline.partial} | ${s.headline.partial_pct}% |`);
  lines.push(`| **אין הצהרת נגישות כלל** | ${s.headline.no_statement_at_all} | **${s.headline.no_statement_pct}%** |`);
  lines.push("");
  lines.push(`**${s.headline.not_compliant_pct}% מהאתרים שנבדקו אינם עומדים בדרישת ההצהרה** - העילה שעליה הוגשו בפועל רוב התביעות בישראל.`);
  lines.push("");
  lines.push(`## ווידג'טים`);
  lines.push("");
  lines.push(`${s.overlays.total} אתרים (${s.overlays.pct}%) מריצים ווידג'ט נגישות.`);
  if (s.overlays.total) {
    lines.push("");
    for (const [vendor, n] of Object.entries(s.overlays.by_vendor).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${vendor}: ${n}`);
    }
    lines.push("");
    lines.push(`מתוכם **${s.overlays.with_overlay_but_not_compliant} (${s.overlays.with_overlay_but_not_compliant_pct}%) עדיין אינם עומדים בדרישת ההצהרה** - כלומר שילמו על פתרון ונשארו חשופים בדיוק לעילה שנתבעים עליה.`);
  }
  lines.push("");
  lines.push(`## איכות ההצהרות`);
  lines.push("");
  lines.push(`- מזכירות את התקן או את התקנות: ${s.quality.mentions_standard}`);
  lines.push(`- מציינות רכז נגישות בשמו/בתפקידו: ${s.quality.names_coordinator} (${s.quality.names_coordinator_pct}%)`);
  lines.push("");
  lines.push(`## לפי ענף`);
  lines.push("");
  lines.push(`| ענף | נבדקו | עומדים | ללא הצהרה | עם ווידג'ט |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  const cats = Object.entries(s.by_category).sort((a, b) => a[1].compliant / a[1].n - b[1].compliant / b[1].n);
  for (const [name, c] of cats) {
    lines.push(`| ${name} | ${c.n} | ${c.compliant} (${pct(c.compliant, c.n)}%) | ${c.none} | ${c.overlay} |`);
  }
  lines.push("");
  lines.push(`## מה המספר הזה אומר ומה לא`);
  lines.push("");
  lines.push(`הוא אומר שלאתר יש או אין הצהרת נגישות עם פרטי התקשרות - תנאי בינארי שתקנה 35(ה) דורשת במפורש.`);
  lines.push(`הוא **אינו** אומר שהאתר נגיש, ואינו קובע עמידה בת"י 5568: בדיקה אוטומטית מזהה כ-30%-40% מדרישות WCAG,`);
  lines.push(`והשאר מחייב בדיקה אנושית. הוא גם אינו חוות דעת משפטית.`);
  return lines.join("\n");
}

run().catch((err) => {
  console.error("הסקר נכשל:", err);
  process.exit(1);
});
