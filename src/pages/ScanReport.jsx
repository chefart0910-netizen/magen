// MAGEN - דוח לקוח להדפסה / שמירה כ-PDF.
// ==========================================================================================
// למה עמוד להדפסה ולא יצירת PDF בשרת: כל ספריות ה-PDF ב-Node דורשות הטמעת פונט עברי
// וטיפול ידני ב-bidi (סדר מימין לשמאל, מספרים ופיסוק בתוך משפט עברי) - שם נשברים רוב
// הפתרונות. הדפדפן כבר יודע לעשות את זה נכון, וגם לייצא PDF וקטורי איכותי. בנוסף:
// אפס תלויות חדשות בפונקציה ה-serverless (שכבר קרובה לתקרת 250MB), אפס עלות, ואפס זמן
// ריצה בשרת. הכפתור מפעיל window.print() והמשתמש בוחר "שמור כ-PDF".
// העיצוב כאן מכוון להדפסה: רקע לבן, טקסט שחור, בלי צללים - לא ערכת הצבעים הכהה של האפליקציה.

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate, IMPACT_LABELS, SCAN_TYPE_LABELS } from "../lib/format";

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const SEVERITY_WEIGHT = { critical: 12, serious: 7, moderate: 3, minor: 1 };

function grade(score) {
  if (score === null || score === undefined) return { text: "לא נבדק", cls: "na" };
  if (score >= 90) return { text: "תקין", cls: "good" };
  if (score >= 50) return { text: "דורש שיפור", cls: "mid" };
  return { text: "טעון טיפול", cls: "bad" };
}

function Score({ label, value }) {
  const g = grade(value);
  return (
    <div className={`rep-score rep-${g.cls}`}>
      <div className="rep-score-num">{value ?? "—"}</div>
      <div className="rep-score-label">{label}</div>
      <div className="rep-score-grade">{g.text}</div>
    </div>
  );
}

// סדר העדיפויות אינו לפי חומרה בלבד: ממצא "בינוני" שחוזר על 40 רכיבים משפיע על המשתמש
// יותר מממצא "חמור" בודד, וגם עולה פחות לתקן ביחס להשפעה. משקללים חומרה × מספר רכיבים.
function priorityList(violations = [], securityFindings = []) {
  const a11y = violations.map((v) => ({
    kind: "נגישות",
    title: v.guided_fix?.summary || v.description,
    impact: v.impact,
    count: v.nodes_affected,
    weight: (SEVERITY_WEIGHT[v.impact] || 2) * (v.nodes_affected || 1),
    fix: v.guided_fix?.fix,
  }));
  const sec = securityFindings.map((f) => ({
    kind: "אבטחה",
    title: f.title,
    impact: f.severity,
    count: 1,
    weight: SEVERITY_WEIGHT[f.severity] || 2,
    fix: f.guided_fix?.fix,
  }));
  return [...a11y, ...sec].sort((x, y) => y.weight - x.weight).slice(0, 5);
}

function AccessibilitySection({ accessibility }) {
  if (!accessibility) return null;
  const violations = [...(accessibility.violations || [])].sort(
    (a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9)
  );

  return (
    <section className="rep-section">
      <h2>נגישות</h2>
      <p className="rep-lead">
        נבדקו {accessibility.passes_count + accessibility.violations_count} כללי נגישות אוטומטיים
        (axe-core, מבוסס WCAG 2.1). {accessibility.passes_count} עברו בהצלחה,{" "}
        {accessibility.violations_count} נכשלו.
      </p>

      {violations.length === 0 ? (
        <p className="rep-ok">לא נמצאו ממצאי נגישות בבדיקה האוטומטית.</p>
      ) : (
        violations.map((v, i) => (
          <div className="rep-finding" key={i}>
            <div className="rep-finding-head">
              <span className={`rep-badge rep-${v.impact}`}>{IMPACT_LABELS[v.impact] || v.impact}</span>
              <strong>{v.guided_fix?.summary || v.description}</strong>
            </div>
            <div className="rep-meta">
              {v.nodes_affected} רכיבים מושפעים
              {v.guided_fix?.wcag ? ` · WCAG ${v.guided_fix.wcag}` : ""} · כלל: {v.id}
            </div>
            <div className="rep-desc">{v.description}</div>
            {v.guided_fix?.fix && (
              <div className="rep-fix">
                <span className="rep-fix-label">כיצד מתקנים</span>
                {v.guided_fix.fix}
              </div>
            )}
          </div>
        ))
      )}

      {accessibility.locked_violations_count > 0 && (
        <p className="rep-note">
          {accessibility.locked_violations_count} ממצאים נוספים אינם מוצגים בדוח זה (חבילה חינמית).
        </p>
      )}
    </section>
  );
}

function PerformanceSection({ lighthouse }) {
  if (!lighthouse) return null;
  const cwv = lighthouse.core_web_vitals;
  return (
    <section className="rep-section">
      <h2>ביצועים, תקינות ו-SEO</h2>
      {cwv ? (
        <table className="rep-table">
          <tbody>
            <tr>
              <td>טעינת התוכן הראשון (FCP)</td>
              <td dir="ltr">{cwv.first_contentful_paint || "—"}</td>
            </tr>
            <tr>
              <td>טעינת הרכיב המרכזי (LCP)</td>
              <td dir="ltr">{cwv.largest_contentful_paint || "—"}</td>
            </tr>
            <tr>
              <td>זמן חסימה כולל (TBT)</td>
              <td dir="ltr">{cwv.total_blocking_time || "—"}</td>
            </tr>
            <tr>
              <td>יציבות פריסה (CLS)</td>
              <td dir="ltr">{cwv.cumulative_layout_shift || "—"}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="rep-note">מדדי הליבה (Core Web Vitals) אינם כלולים בדוח זה.</p>
      )}
    </section>
  );
}

function SecuritySection({ result }) {
  const cert = result.certificate;
  const findings = [...(result.findings || [])].sort(
    (a, b) => (IMPACT_ORDER[a.severity] ?? 9) - (IMPACT_ORDER[b.severity] ?? 9)
  );

  return (
    <section className="rep-section">
      <h2>אבטחה</h2>
      <p className="rep-lead">
        בדיקה פסיבית בלבד: כותרות אבטחה, cookies, תעודת TLS, אכיפת HTTPS וקבצים חשופים ידועים.
        לא בוצע ניסיון חדירה לאתר.
      </p>

      <table className="rep-table">
        <tbody>
          <tr>
            <td>תעודת TLS</td>
            <td>
              {cert
                ? `${cert.issuer || "מנפיק לא ידוע"} · תפוג בעוד ${cert.days_remaining} ימים`
                : "לא נקראה"}
            </td>
          </tr>
          <tr>
            <td>הפניית HTTP ל-HTTPS</td>
            <td>
              {result.https?.not_applicable
                ? "לא רלוונטי"
                : result.https?.enforced
                ? "נאכפת"
                : "לא נאכפת"}
            </td>
          </tr>
          <tr>
            <td>Cookies</td>
            <td>
              {(result.cookies || []).length} סה"כ ·{" "}
              {(result.cookies || []).filter((c) => c.issues.length > 0).length} חסרי דגלי אבטחה
            </td>
          </tr>
          <tr>
            <td>קבצים חשופים</td>
            <td>
              {(result.exposed_paths || []).length === 0
                ? "לא נמצאו"
                : result.exposed_paths.map((p) => p.path).join(", ")}
            </td>
          </tr>
        </tbody>
      </table>

      {findings.length === 0 ? (
        <p className="rep-ok">לא נמצאו ממצאי אבטחה בבדיקה הפסיבית.</p>
      ) : (
        findings.map((f, i) => (
          <div className="rep-finding" key={i}>
            <div className="rep-finding-head">
              <span className={`rep-badge rep-${f.severity}`}>
                {IMPACT_LABELS[f.severity] || f.severity}
              </span>
              <strong>{f.title}</strong>
            </div>
            <div className="rep-desc">{f.description}</div>
            {f.evidence && <div className="rep-meta rep-break">{f.evidence}</div>}
            {f.guided_fix?.fix && (
              <div className="rep-fix">
                <span className="rep-fix-label">כיצד מתקנים</span>
                {f.guided_fix.fix}
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}

export default function ScanReport() {
  const { scanId } = useParams();
  const [scan, setScan] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getScanDetail(scanId)
      .then((data) => {
        if (!cancelled) setScan(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  // גוף המסמך צבוע כהה בכל שאר האפליקציה; בעמוד הזה זה היה משאיר פסים שחורים משני צדי
  // הדוח על המסך. מסירים את הצבע כל עוד הדוח פתוח, ומחזירים ביציאה ממנו.
  useEffect(() => {
    document.body.classList.add("report-mode");
    return () => document.body.classList.remove("report-mode");
  }, []);

  // כותרת הלשונית היא גם שם ברירת המחדל של קובץ ה-PDF שהדפדפן מציע לשמור.
  useEffect(() => {
    if (!scan?.result?.url) return;
    const prev = document.title;
    const host = (() => {
      try {
        return new URL(scan.result.url).hostname;
      } catch {
        return scan.result.url;
      }
    })();
    document.title = `דוח בריאות אתר - ${host}`;
    return () => {
      document.title = prev;
    };
  }, [scan]);

  if (error) {
    return (
      <div className="report-doc">
        <p className="rep-error">{error}</p>
        <Link to="/dashboard">חזרה לרשימת האתרים</Link>
      </div>
    );
  }
  if (!scan) return <div className="report-doc">טוען את הדוח…</div>;

  const result = scan.result;
  if (!result) {
    return (
      <div className="report-doc">
        <p className="rep-error">לבדיקה זו אין תוצאה שמורה - לא ניתן להפיק דוח.</p>
        <Link to="/dashboard">חזרה לרשימת האתרים</Link>
      </div>
    );
  }

  const isSecurity = result.scan_kind === "passive";
  const priorities = priorityList(
    result.accessibility?.violations,
    isSecurity ? result.findings : []
  );

  return (
    <div className="report-doc">
      <div className="rep-actions no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>
          שמירה כ-PDF / הדפסה
        </button>
        <Link className="btn btn-secondary" to={`/sites/${scan.site_id}`}>
          חזרה לאתר
        </Link>
      </div>

      <header className="rep-header">
        <div className="rep-brand">MAGEN</div>
        <h1>דוח בריאות אתר</h1>
        <div className="rep-subject">{result.url}</div>
        <div className="rep-meta">
          {SCAN_TYPE_LABELS[scan.scan_type] || scan.scan_type} · נבדק בתאריך{" "}
          {formatDate(result.scanned_at || scan.created_at)}
        </div>
      </header>

      <section className="rep-section">
        <h2>תמצית</h2>
        <div className="rep-scores">
          {isSecurity ? (
            <>
              <Score label="אבטחה" value={result.score} />
              <div className="rep-score rep-na">
                <div className="rep-score-num">{result.findings_count ?? 0}</div>
                <div className="rep-score-label">ממצאים</div>
                <div className="rep-score-grade">דירוג {result.grade}</div>
              </div>
            </>
          ) : (
            <>
              <Score label="נגישות" value={result.accessibility?.computed_score} />
              <Score label="ביצועים" value={result.lighthouse?.performance} />
              <Score label="תקינות" value={result.lighthouse?.best_practices} />
              <Score label="SEO" value={result.lighthouse?.seo} />
            </>
          )}
        </div>

        {priorities.length > 0 && (
          <>
            <h3>מה כדאי לתקן קודם</h3>
            <ol className="rep-priorities">
              {priorities.map((p, i) => (
                <li key={i}>
                  <strong>{p.title}</strong>
                  <span className="rep-meta">
                    {" "}
                    ({p.kind}, {IMPACT_LABELS[p.impact] || p.impact}
                    {p.count > 1 ? `, ${p.count} רכיבים` : ""})
                  </span>
                  {p.fix && <div className="rep-desc">{p.fix}</div>}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      {isSecurity ? (
        <SecuritySection result={result} />
      ) : (
        <>
          <AccessibilitySection accessibility={result.accessibility} />
          <PerformanceSection lighthouse={result.lighthouse} />
        </>
      )}

      {result.errors?.length > 0 && (
        <section className="rep-section">
          <h2>הערות על הבדיקה</h2>
          <ul>
            {result.errors.map((e, i) => (
              <li key={i} className="rep-desc">
                {e}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="rep-footer">
        <p>
          דוח זה מבוסס על בדיקה אוטומטית שבוצעה במועד המצוין לעיל, ומשקף את מצב העמוד שנבדק
          באותו רגע בלבד. בדיקה אוטומטית מזהה חלק מהליקויים בלבד: היא אינה תחליף לבדיקה ידנית,
          ואינה מהווה אישור עמידה בתקן נגישות (ת"י 5568) או בכל דרישה רגולטורית אחרת.
        </p>
        <p className="rep-meta">הופק על ידי MAGEN · magen-pi.vercel.app</p>
      </footer>
    </div>
  );
}
