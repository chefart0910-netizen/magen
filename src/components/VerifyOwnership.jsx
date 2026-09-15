import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// MAGEN - פאנל אימות בעלות על אתר.
// ==========================================================================================
// קודם כאן היה כפתור אחד שהדליק את הדגל בלי לבדוק דבר. עכשיו המשתמש מקבל אסימון ושלוש
// דרכים לשים אותו, והשרת בודק בפועל (ראו lib/routes/sites.js). הדגל הזה הוא מה שפותח
// בדיקת עומס מלאה ופנטסט אקטיבי - בדיקות שמותר להריץ רק על אתר שלך.
//
// יציבות פריסה: הפאנל נבנה במבנה הסופי שלו מיד, ורק האסימון עצמו מתחלף כשהתשובה חוזרת
// מהשרת. הגרסה הקודמת רינדרה "כלום" עד שהמידע הגיע ואז תפחה - וזה נמדד כ-CLS והוריד את
// ציון הביצועים של העמוד. מבנה זהה לפני ואחרי = אפס תזוזה. מסיבה זו גם דגל האדמין נלקח
// מ-AuthContext, שזמין כבר בציור הראשון, ולא מתשובת השרת.

const METHOD_LABEL = {
  dns: "רשומת DNS",
  file: "קובץ באתר",
  meta: "תג meta",
  admin: "אדמין",
};

const TOKEN_PLACEHOLDER = "································";

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
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

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
      .catch((err) => {
        // עד כה השגיאה נבלעה: info נשאר null, ולכן המשתמש ראה אסימון מדומה ודומיין
        // לדוגמה, עם כפתור "בדוק אימות" מושבת לנצח ובלי שום הסבר - וזה חוסם גם את
        // בדיקת העומס והפנטסט, ששניהם דורשים אימות.
        if (alive) setError(err?.message || "לא הצלחנו לטעון את הוראות האימות. נסו לרענן את הדף.");
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

  const token = info?.token || TOKEN_PLACEHOLDER;
  const host = (() => {
    try {
      return info?.instructions?.dns?.name || "_magen.example.co.il";
    } catch {
      return "_magen.example.co.il";
    }
  })();

  return (
    <div className="card vo">
      <h2 className="vo-title">אימות בעלות</h2>
      <p className="text-dim vo-p">
        בדיקת עומס מלאה ופנטסט אקטיבי שולחות תעבורה אמיתית לאתר, ולכן הן נפתחות רק לאתר
        שהוכחתם שהוא שלכם. בדיקות הביצועים, הנגישות והאבטחה הפסיבית לא דורשות אימות.
      </p>

      {isAdmin ? (
        <div className="info-banner">
          חשבון אדמין: לחיצה על "בדוק אימות" תאמת מיד בלי בדיקה חיצונית, כדי שתוכל לבחון את
          המערכת. האחריות על מה שמופעל היא שלך.
        </div>
      ) : (
        <>
          <p className="vo-p">
            בחרו <strong>דרך אחת</strong> מהשלוש, ואז לחצו "בדוק אימות".
          </p>
          <div className="vo-methods">
            <div className="vo-method">
              <h3>1. רשומת DNS (החזק ביותר)</h3>
              <Row label="שם" value={host} />
              <Row label="סוג" value="TXT" />
              <Row label="ערך" value={`magen-verify=${token}`} />
              <p className="text-dim vo-note">עדכון DNS יכול לקחת עד כמה שעות עד שהוא נראה.</p>
            </div>

            <div className="vo-method">
              <h3>2. קובץ באתר</h3>
              <Row label="נתיב" value="/.well-known/magen-verify.txt" />
              <Row label="תוכן" value={token} />
              <p className="text-dim vo-note">קובץ טקסט שמכיל את השורה הזו בלבד.</p>
            </div>

            <div className="vo-method">
              <h3>3. תג meta בעמוד הבית</h3>
              <Row label="תג" value={`<meta name="magen-verify" content="${token}">`} />
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

      <button className="btn btn-secondary" onClick={check} disabled={checking || !info}>
        {checking && <span className="spinner" />} בדוק אימות
      </button>
    </div>
  );
}
