import { useState } from "react";
import { api } from "../lib/api";

// MAGEN - פרסום תוצאת סריקה כעמוד ציבורי.
// ==========================================================================================
// הכפתור הזה מייצר כתובת קצרה וקבועה שכל אחד יכול לפתוח, גם בלי חשבון. הוא מופיע רק
// לבעל האתר, ורק על אתר שהבעלות בו מאומתת - פרסום חולשות של אתר שאינו שלך יכול להזיק
// לבעליו. ביטול הפרסום מיידי, והכתובת נשמרת כך שפרסום חוזר לא מייצר קישור חדש.

export default function SharePublic({ siteId, scan, verified }) {
  const [isPublic, setIsPublic] = useState(!!scan.is_public);
  const [slug, setSlug] = useState(scan.public_slug || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  if (!scan?.id || scan.status !== "completed") return null;

  const url = slug ? `${window.location.origin}/s/${slug}` : null;

  const toggle = async (publish) => {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const data = await api.shareScan(siteId, scan.id, publish);
      setIsPublic(!!data.is_public);
      if (data.public_slug) setSlug(data.public_slug);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="card vo">
      <h2 className="vo-title">שיתוף ציבורי</h2>

      {!verified ? (
        <p className="text-dim vo-p">
          פרסום תוצאה ציבורית דורש אימות בעלות על האתר. אחרי האימות אפשר לייצר מכאן קישור
          פתוח לשיתוף.
        </p>
      ) : (
        <p className="text-dim vo-p">
          קישור פתוח שכל אחד יכול לפתוח, גם בלי חשבון. מוצגים בו הציונים וכותרות שלושת
          הממצאים הבולטים - לא הוראות התיקון ולא פירוט האלמנטים.
        </p>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {isPublic && url && (
        <>
          <div className="vo-row">
            <span className="vo-row-label">הקישור</span>
            <code className="vo-code" dir="ltr">
              {url}
            </code>
          </div>
          <div className="lp-cta-row" style={{ justifyContent: "flex-start", marginBottom: 12 }}>
            <button className="btn btn-sm btn-secondary" onClick={copy}>
              {copied ? "הועתק" : "העתק קישור"}
            </button>
            <a className="btn btn-sm btn-secondary" href={url} target="_blank" rel="noreferrer">
              פתח
            </a>
          </div>
        </>
      )}

      {verified &&
        (isPublic ? (
          <button className="btn btn-danger" disabled={busy} onClick={() => toggle(false)}>
            הפסק פרסום
          </button>
        ) : (
          <button className="btn btn-secondary" disabled={busy} onClick={() => toggle(true)}>
            פרסם תוצאה בקישור ציבורי
          </button>
        ))}
    </div>
  );
}
