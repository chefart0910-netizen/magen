import { useEffect, useState } from "react";
import { api } from "../lib/api";

// MAGEN - פאנל אימות בעלות על אתר.
// ==========================================================================================
// קודם כאן היה כפתור אחד שהדליק את הדגל בלי לבדוק דבר. עכשיו המשתמש מקבל אסימון ושלוש
// דרכים לשים אותו, והשרת בודק בפועל (ראו lib/routes/sites.js). הדגל הזה הוא מה שפותח
// בדיקת עומס מלאה ופנטסט אקטיבי - בדיקות שמותר להריץ רק על אתר שלך.

const METHOD_LABEL = {
  dns: "רשומת DNS",
  file: "קובץ באתר",
  meta: "תג meta",
  admin: "אדמין",
};

function Row({ label, value }) {
  return (
    <div className="vo-row">
      <span className="vo-row-label">{label}</span>
      <code className="vo-code" dir="ltr">
        {value}
      </code>
    </div>
  );
}

export default function VerifyOwnership({ siteId, verified, onVerified }) {
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .getVerification(siteId)
      .then((data) => {
        if (alive) setInfo(data);
      })
      .catch(() => {
        /* הוראות האימות אינן חוסמות את שאר העמוד */
      });
    return () => {
      alive = false;
    };
  }, [siteId]);

  const check = async () => {
    setChecking(true);
    setError("");
    try {
      const data = await api.verifyOwnership(siteId);
      setInfo((prev) => (prev ? { ...prev, verified: true, method: data.method } : prev));
      onVerified?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  if (verified) {
    return (
      <div className="card vo">
        <h2 className="vo-title">בעלות מאומתת</h2>
        <p className="text-dim vo-p">
          {info?.method
            ? `האימות בוצע באמצעות ${METHOD_LABEL[info.method] || info.method}.`
            : "האתר מאומת."}{" "}
          בדיקת עומס מלאה ופנטסט אקטיבי זמינים לאתר הזה.
        </p>
      </div>
    );
  }

  return (
    <div className="card vo">
      <h2 className="vo-title">אימות בעלות</h2>
      <p className="text-dim vo-p">
        בדיקת עומס מלאה ופנטסט אקטיבי שולחות תעבורה אמיתית לאתר, ולכן הן נפתחות רק לאתר
        שהוכחתם שהוא שלכם. בדיקות הביצועים, הנגישות והאבטחה הפסיבית לא דורשות אימות.
      </p>

      {info?.admin_exempt && (
        <div className="info-banner">
          חשבון אדמין: לחיצה על "בדוק אימות" תאמת מיד בלי בדיקה חיצונית, כדי שתוכל לבחון את
          המערכת. האחריות על מה שמופעל היא שלך.
        </div>
      )}

      {info?.token && !info.admin_exempt && (
        <>
          <p className="vo-p">
            בחרו <strong>דרך אחת</strong> מהשלוש, ואז לחצו "בדוק אימות".
          </p>
          <div className="vo-methods">
            <div className="vo-method">
              <h3>1. רשומת DNS (החזק ביותר)</h3>
              <Row label="שם" value={info.instructions.dns.name} />
              <Row label="סוג" value={info.instructions.dns.type} />
              <Row label="ערך" value={info.instructions.dns.value} />
              <p className="text-dim vo-note">עדכון DNS יכול לקחת עד כמה שעות עד שהוא נראה.</p>
            </div>

            <div className="vo-method">
              <h3>2. קובץ באתר</h3>
              <Row label="נתיב" value={info.instructions.file.path} />
              <Row label="תוכן" value={info.instructions.file.content} />
              <p className="text-dim vo-note">קובץ טקסט שמכיל את השורה הזו בלבד.</p>
            </div>

            <div className="vo-method">
              <h3>3. תג meta בעמוד הבית</h3>
              <Row label="תג" value={info.instructions.meta.tag} />
              <p className="text-dim vo-note">
                בוורדפרס: בתוך ה-&lt;head&gt; של התבנית או דרך תוסף שמוסיף קוד ל-head.
              </p>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <button className="btn btn-secondary" onClick={check} disabled={checking}>
        {checking && <span className="spinner" />} בדוק אימות
      </button>
    </div>
  );
}
