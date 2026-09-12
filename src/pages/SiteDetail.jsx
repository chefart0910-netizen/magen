import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import ExpertReview from "../components/ExpertReview";
import VerifyOwnership from "../components/VerifyOwnership";
import ExpertAccess from "../components/ExpertAccess";
import SharePublic from "../components/SharePublic";
import {
  formatDate,
  scoreClass,
  SCAN_TYPE_LABELS,
  STATUS_LABELS,
  IMPACT_LABELS,
} from "../lib/format";

function ScoreBox({ label, value }) {
  return (
    <div className="score-box">
      <div className={`score-value ${scoreClass(value)}`}>{value ?? "-"}</div>
      <div className="score-label">{label}</div>
    </div>
  );
}

function ViolationsList({ accessibility }) {
  if (!accessibility) return null;
  const { violations, locked_violations_count } = accessibility;

  return (
    <div>
      <h3 style={{ fontSize: 16 }}>ממצאי נגישות ({accessibility.violations_count})</h3>
      {violations.map((v, i) => (
        <div className="violation" key={i}>
          <div className="v-head">
            <span className="v-id">{v.id}</span>
            <span className={`impact-badge impact-${v.impact}`}>{IMPACT_LABELS[v.impact] || v.impact}</span>
          </div>
          <div>{v.description}</div>
          <div className="text-dim" style={{ fontSize: 12, marginTop: 4 }}>
            {v.nodes_affected} רכיבים מושפעים ·{" "}
            <a href={v.help_url} target="_blank" rel="noreferrer">
              תיעוד מלא
            </a>
          </div>
          {v.guided_fix && (
            <div className="guided-fix">
              <div className="gf-title">💡 {v.guided_fix.summary}</div>
              <div>{v.guided_fix.fix}</div>
              {v.guided_fix.wcag && (
                <div className="text-dim" style={{ marginTop: 4 }}>
                  תקן WCAG: {v.guided_fix.wcag}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {locked_violations_count > 0 && (
        <div className="locked-note">
          🔒 עוד {locked_violations_count} ממצאים נעולים בחבילה החינמית - שדרג לדוח מלא כדי לראות את כולם.
        </div>
      )}
    </div>
  );
}

function SecurityFindings({ findings }) {
  if (!findings || findings.length === 0) {
    return <div className="success-banner">לא נמצאו ממצאי אבטחה בסריקה הפסיבית.</div>;
  }
  return (
    <div>
      <h3 style={{ fontSize: 16 }}>ממצאי אבטחה ({findings.length})</h3>
      {findings.map((f, i) => (
        <div className="violation" key={i}>
          <div className="v-head">
            <span className="v-id">{f.id}</span>
            <span className={`impact-badge impact-${f.severity}`}>
              {IMPACT_LABELS[f.severity] || f.severity}
            </span>
          </div>
          <div>{f.title}</div>
          <div className="text-dim" style={{ fontSize: 12, marginTop: 4 }}>{f.description}</div>
          {f.evidence && (
            <div className="text-dim" style={{ fontSize: 12, marginTop: 4, wordBreak: "break-all" }}>
              {f.evidence}
            </div>
          )}
          {f.guided_fix && (
            <div className="guided-fix">
              <div className="gf-title">💡 איך מתקנים</div>
              <div>{f.guided_fix.fix}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SecurityResultCard({ result }) {
  const cert = result.certificate;
  const badCookies = (result.cookies || []).filter((c) => c.issues.length > 0).length;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="info-banner">
        סריקה פסיבית: נבדקות כותרות אבטחה, cookies, תעודת TLS, אכיפת HTTPS וקבצים חשופים.
        אין כאן ניסיון חדירה בפועל - לכך נועד הפנטסט האקטיבי.
      </div>

      <div className="score-row">
        <ScoreBox label={`ציון אבטחה (${result.grade})`} value={result.score} />
        <ScoreBox label="ממצאים" value={result.findings_count} />
      </div>

      <table className="table" style={{ marginTop: 12 }}>
        <tbody>
          <tr>
            <td>תעודת TLS</td>
            <td className="text-dim">
              {cert
                ? `${cert.issuer || "לא ידוע"} · פגה בעוד ${cert.days_remaining} ימים · ${cert.protocol || ""}`
                : "לא נקראה"}
            </td>
          </tr>
          <tr>
            <td>הפניית HTTP ל-HTTPS</td>
            <td className="text-dim">
              {result.https?.not_applicable
                ? "לא רלוונטי (פורט לא סטנדרטי)"
                : result.https?.enforced
                ? "נאכפת"
                : "לא נאכפת"}
            </td>
          </tr>
          <tr>
            <td>Cookies</td>
            <td className="text-dim">
              {(result.cookies || []).length} סה"כ
              {badCookies > 0 ? ` · ${badCookies} חסרי דגלי אבטחה` : ""}
            </td>
          </tr>
          <tr>
            <td>קבצים חשופים</td>
            <td className="text-dim">
              {(result.exposed_paths || []).length === 0
                ? "לא נמצאו"
                : result.exposed_paths.map((p) => p.path).join(", ")}
            </td>
          </tr>
        </tbody>
      </table>

      {result.zap_error && (
        <div className="error-banner">סריקת ZAP הנוספת נכשלה: {result.zap_error}</div>
      )}

      <SecurityFindings findings={result.findings} />
    </div>
  );
}

// דוח הלקוח נפתח בלשונית חדשה כדי שלא לאבד את מצב העמוד (הבדיקה שנבחרה, הודעות מצב),
// ומשם המשתמש שומר אותו כ-PDF דרך הדפדפן.
function ReportLink({ scanId }) {
  if (!scanId) return null;
  return (
    <a className="btn btn-secondary btn-sm" href={`/report/${scanId}`} target="_blank" rel="noreferrer">
      דוח ללקוח (PDF)
    </a>
  );
}

function ScanResultCard({ scan }) {
  const result = scan.result;
  if (!result) return null;
  // תוצאת סריקת אבטחה נראית אחרת לגמרי מתוצאת Lighthouse/axe
  if (result.scan_kind === "passive")
    return (
      <>
        <div className="report-cta">
          <ReportLink scanId={scan.id} />
        </div>
        <SecurityResultCard result={result} />
      </>
    );

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="report-cta">
        <ReportLink scanId={scan.id} />
      </div>
      {result.partial && (
        <div className="info-banner">
          זהו דוח חלקי (חבילה חינמית) - הציונים אמיתיים, אך חלק מהפירוט נעול.
        </div>
      )}

      {result.errors?.length > 0 && (
        <div className="error-banner">
          חלק מהבדיקה לא הושלמה: {result.errors.join(" | ")}
        </div>
      )}

      {result.lighthouse && (
        <div className="score-row">
          <ScoreBox label="ביצועים" value={result.lighthouse.performance} />
          <ScoreBox label="Best Practices" value={result.lighthouse.best_practices} />
          <ScoreBox label="SEO" value={result.lighthouse.seo} />
        </div>
      )}

      {result.accessibility && (
        <>
          <div className="score-row">
            <ScoreBox label="ציון נגישות משוקלל" value={result.accessibility.computed_score} />
          </div>
          <ViolationsList accessibility={result.accessibility} />
        </>
      )}
    </div>
  );
}

export default function SiteDetail() {
  const { siteId } = useParams();
  const { user } = useAuth();
  const [site, setSite] = useState(null);
  const [scans, setScans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(null); // key of the running action

  const load = useCallback(async () => {
    try {
      const [sitesData, scansData] = await Promise.all([api.listSites(), api.listScans(siteId)]);
      const found = sitesData.sites.find((s) => s.id === siteId);
      setSite(found || null);
      setScans(scansData.scans);
    } catch (err) {
      setError(err.message);
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  const openScan = async (scanId) => {
    setError("");
    try {
      const detail = await api.getScanDetail(scanId);
      setSelected(detail);
    } catch (err) {
      setError(err.message);
    }
  };

  // סריקה שרצה על runner של GitHub Actions חוזרת מיד עם status "running", והתוצאה
  // מגיעה לשרת דקה-שתיים אחר כך דרך ה-callback. עד אז מרעננים את ההיסטוריה כל כמה
  // שניות ומחכים שהרשומה תצא ממצב "רץ".
  const waitForScan = async (scanId) => {
    const deadline = Date.now() + 8 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      let data;
      try {
        data = await api.listScans(siteId);
      } catch (err) {
        continue; // תקלת רשת רגעית לא צריכה להפיל את ההמתנה
      }
      setScans(data.scans);
      const scan = data.scans.find((s) => s.id === scanId);
      if (!scan || scan.status === "running" || scan.status === "queued") continue;

      if (scan.status === "completed") {
        setNotice("הבדיקה הסתיימה בהצלחה.");
        await openScan(scanId);
      } else {
        setError("הבדיקה נכשלה. פתחו אותה בהיסטוריה כדי לראות את הסיבה.");
      }
      return;
    }
    setError("הבדיקה עדיין רצה. רעננו את העמוד בעוד כמה דקות כדי לראות את התוצאה.");
  };

  const runAction = async (key, fn) => {
    setRunning(key);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      // פיצ'ר שעדיין אין לו תשתית מחזיר available:false - זו לא שגיאה, ואסור שיוצג כאדום.
      if (result?.available === false) {
        setNotice(result.message);
        setRunning(null);
        return;
      }
      if (result?.async && result?.scan_id) {
        setNotice("הבדיקה רצה כעת ברקע. התוצאה תופיע כאן אוטומטית כשתהיה מוכנה.");
        await load();
        await waitForScan(result.scan_id);
        return;
      }
      setNotice("הבדיקה הסתיימה בהצלחה.");
      await load();
      if (result?.scan_id) {
        await openScan(result.scan_id);
      } else {
        setSelected({ id: null, scan_type: key, status: "completed", result });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(null);
    }
  };

  if (!site && !error) return <div className="text-dim">טוען...</div>;
  if (!site) {
    return (
      <div className="card empty-state">
        <div>האתר לא נמצא</div>
        <Link className="btn btn-secondary" style={{ marginTop: 12 }} to="/dashboard">
          חזרה לרשימת האתרים
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/dashboard">האתרים שלי</Link> / {site.url}
      </div>

      <div className="page-header">
        <div>
          <h1>{site.label || site.url}</h1>
          <div className="sub">{site.url}</div>
        </div>
        <span className={`chip ${site.ownership_verified ? "verified" : "unverified"}`}>
          {site.ownership_verified ? "בעלות מאומתת" : "בעלות לא מאומתת"}
        </span>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="success-banner">{notice}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>הרצת בדיקות</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            disabled={running !== null}
            onClick={() => runAction("scan", () => api.runScan(siteId))}
          >
            {running === "scan" && <span className="spinner" />} בדיקה בסיסית (ביצועים + נגישות)
          </button>
          <button
            className="btn btn-secondary"
            disabled={running !== null}
            onClick={() => runAction("security", () => api.runSecurityScan(siteId))}
          >
            {running === "security" && <span className="spinner" />} בדיקת אבטחה
          </button>
          <button
            className="btn btn-secondary"
            disabled={running !== null}
            onClick={() => runAction("load", () => api.runLoadTest(siteId, {}))}
          >
            {running === "load" && <span className="spinner" />} בדיקת עומס מלאה (בקרוב)
          </button>
          {user?.is_admin && (
            <button
              className="btn btn-secondary"
              disabled={running !== null}
              onClick={() => runAction("pentest", () => api.runPentest(siteId))}
            >
              {running === "pentest" && <span className="spinner" />} פנטסט אקטיבי (בקרוב)
            </button>
          )}
        </div>
      </div>

      <VerifyOwnership
        siteId={siteId}
        verified={!!site.ownership_verified}
        onVerified={load}
      />

      <ExpertAccess siteId={siteId} />

      {selected && <ScanResultCard scan={selected} />}
      {selected?.id && (
        <SharePublic siteId={siteId} scan={selected} verified={!!site.ownership_verified} />
      )}
      {selected?.id && <ExpertReview scanId={selected.id} scanStatus={selected.status} />}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>היסטוריית בדיקות</h2>
        {scans.length === 0 ? (
          <div className="text-dim">עדיין לא בוצעו בדיקות לאתר זה.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>סוג בדיקה</th>
                <th>סטטוס</th>
                <th>ביצועים</th>
                <th>נגישות</th>
                <th>אבטחה</th>
                <th>SEO</th>
                <th>תאריך</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.id}>
                  <td>{SCAN_TYPE_LABELS[s.scan_type] || s.scan_type}</td>
                  <td>
                    <span className={`status-badge ${s.status}`}>{STATUS_LABELS[s.status] || s.status}</span>
                  </td>
                  <td className={scoreClass(s.score_performance)}>{s.score_performance ?? "-"}</td>
                  <td className={scoreClass(s.score_accessibility)}>{s.score_accessibility ?? "-"}</td>
                  <td className={scoreClass(s.score_security)}>{s.score_security ?? "-"}</td>
                  <td className={scoreClass(s.score_seo)}>{s.score_seo ?? "-"}</td>
                  <td className="text-dim">{formatDate(s.created_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openScan(s.id)}>
                        פתח
                      </button>
                      {s.status === "completed" && <ReportLink scanId={s.id} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
