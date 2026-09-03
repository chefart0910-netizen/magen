import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
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

function ScanResultCard({ scan }) {
  const result = scan.result;
  if (!result) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
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
          <ScoreBox label="נגישות (Lighthouse)" value={result.lighthouse.accessibility_lighthouse} />
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

  const runAction = async (key, fn) => {
    setRunning(key);
    setError("");
    setNotice("");
    try {
      const result = await fn();
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

  const verify = async () => {
    setRunning("verify");
    setError("");
    try {
      await api.verifyOwnership(siteId);
      await load();
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
            {running === "security" && <span className="spinner" />} בדיקת אבטחה (ZAP)
          </button>
          <button
            className="btn btn-secondary"
            disabled={running !== null}
            onClick={() => runAction("load", () => api.runLoadTest(siteId, {}))}
          >
            {running === "load" && <span className="spinner" />} בדיקת עומס מלאה
          </button>
          {user?.is_admin && (
            <button
              className="btn btn-secondary"
              disabled={running !== null}
              onClick={() => runAction("pentest", () => api.runPentest(siteId))}
            >
              {running === "pentest" && <span className="spinner" />} פנטסט אקטיבי (אדמין בלבד)
            </button>
          )}
          {!site.ownership_verified && (
            <button className="btn btn-secondary" disabled={running !== null} onClick={verify}>
              {running === "verify" && <span className="spinner" />} אמת בעלות (נדרש לעומס/פנטסט)
            </button>
          )}
        </div>
      </div>

      {selected && <ScanResultCard scan={selected} />}

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
                  <td className={scoreClass(s.score_seo)}>{s.score_seo ?? "-"}</td>
                  <td className="text-dim">{formatDate(s.created_at)}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openScan(s.id)}>
                      פתח
                    </button>
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
