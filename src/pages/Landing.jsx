import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Seo from "../components/Seo";
import { api } from "../lib/api";

// MAGEN - עמוד הבית הציבורי.
// ==========================================================================================
// זה העמוד היחיד שגולש אנונימי וגוגל רואים, ולכן הוא צריך לומר בשורה אחת מה המוצר עושה
// ולמי. שדה הסריקה נמצא למעלה בכוונה: מבקר שמקבל ציון אמיתי על האתר שלו לפני הרשמה הוא
// מבקר שיש לו סיבה להירשם. התוצאה כאן חלקית - שלושה ממצאים בכותרת בלבד (ראו routes/public.js).

const SEVERITY_LABEL = {
  critical: "קריטי",
  serious: "חמור",
  moderate: "בינוני",
  minor: "קל",
};

const CHECKS = [
  {
    title: "נגישות לפי תקן ישראלי 5568",
    body: "בדיקה אוטומטית מול כלל הכשלים שנתפסים בכלים - ניגודיות, ניווט מקלדת, תוויות לטפסים וקוראי מסך. זה התחום שבו אתר ישראלי חשוף לתביעה.",
  },
  {
    title: "אבטחה",
    body: "כותרות אבטחה, עוגיות, תוקף תעודת TLS, אכיפת HTTPS, נתיבים חשופים כמו גיבוי wp-config, ותוכן מעורב. בדיקה פסיבית - לא נוגעים באתר.",
  },
  {
    title: "ביצועים",
    body: "Lighthouse על דפדפן אמיתי: מדדי Core Web Vitals, זמן טעינה, ומה בדיוק מאט את העמוד.",
  },
  {
    title: "SEO טכני",
    body: "מה שמונע מגוגל לקרוא ולדרג את העמודים - כותרות, תיאורים, מבנה וקישוריות.",
  },
];

export default function Landing() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!url.trim()) {
      setError("נא להזין כתובת אתר");
      return;
    }
    setLoading(true);
    try {
      const data = await api.publicScan(url.trim());
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lp">
      <Seo
        title="בדיקת נגישות, אבטחה וביצועים לאתר"
        description="MAGEN בודק את האתר שלכם ומחזיר דוח בעברית: נגישות לפי תקן ישראלי 5568, אבטחה, ביצועים ו-SEO. בדיקת אבטחה ראשונה חינם, בלי הרשמה."
        path="/"
      />
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "MAGEN",
            applicationCategory: "SecurityApplication",
            operatingSystem: "Web",
            inLanguage: "he-IL",
            description:
              "בדיקת בריאות אתר בעברית - נגישות לפי תקן ישראלי 5568, אבטחה, ביצועים ו-SEO.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "ILS" },
          })}
        </script>
      </Helmet>

      <section className="lp-hero">
        <p className="lp-eyebrow">בריאות האתר שלך</p>
        <h1 className="lp-title">
          האתר שלך עובד. <span className="lp-title-dim">השאלה היא מה שבור בו ואתה לא רואה.</span>
        </h1>
        <p className="lp-lead">
          MAGEN סורק אתרים של עסקים קטנים ועצמאיים ומחזיר דוח בעברית: נגישות לפי תקן ישראלי
          5568, אבטחה, ביצועים ו-SEO. בדיקת האבטחה הראשונה חינם, כאן, בלי להירשם.
        </p>

        <form className="lp-scan" onSubmit={submit}>
          <label className="label" htmlFor="lp-url">
            כתובת האתר שתיבדק
          </label>
          <div className="lp-scan-row">
            <input
              id="lp-url"
              className="input"
              type="text"
              inputMode="url"
              dir="ltr"
              placeholder="example.co.il"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="url"
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "סורק…" : "בדוק את האתר"}
            </button>
          </div>
          <p className="lp-scan-note">
            בדיקה פסיבית בלבד - קוראים את מה שהאתר מחזיר לכל גולש, לא נוגעים בו ולא נכנסים אליו.
          </p>
        </form>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <p className="lp-loading" role="status">
            בודקים כותרות אבטחה, תעודת TLS, עוגיות ונתיבים חשופים. זה לוקח כמה שניות.
          </p>
        )}

        {result && (
          <div className="lp-result card" aria-live="polite">
            <div className="lp-result-head">
              <div>
                <div className="lp-result-label">ציון אבטחה</div>
                <div className="lp-result-url" dir="ltr">
                  {result.url}
                </div>
              </div>
              <div className={`lp-grade lp-grade-${String(result.grade).charAt(0).toLowerCase()}`}>
                <strong>{result.grade}</strong>
                <span>{result.score}/100</span>
              </div>
            </div>

            <div className="lp-sev">
              {Object.entries(SEVERITY_LABEL).map(([key, label]) => (
                <div className="lp-sev-item" key={key}>
                  <span className={`lp-sev-count lp-sev-${key}`}>{result.by_severity?.[key] ?? 0}</span>
                  <span className="lp-sev-label">{label}</span>
                </div>
              ))}
            </div>

            {result.preview?.length > 0 ? (
              <>
                <h2 className="lp-result-sub">הממצאים הבולטים</h2>
                <ul className="lp-findings">
                  {result.preview.map((f, i) => (
                    <li key={i}>
                      <span className={`chip lp-sev-${f.severity}`}>{SEVERITY_LABEL[f.severity]}</span>
                      <span>{f.title}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="lp-clean">
                לא נמצאו ממצאי אבטחה פסיביים באתר הזה. זה מצב טוב - ונבדק כאן רק חלק אחד מהתמונה.
              </p>
            )}

            <div className="lp-locked">
              <p>
                {result.locked_count > 0
                  ? `נותרו עוד ${result.locked_count} ממצאים, וההסבר מה לעשות עם כל אחד מהם.`
                  : "הדוח המלא כולל גם נגישות לפי תקן ישראלי 5568, ביצועים ו-SEO."}
              </p>
              <Link className="btn btn-primary" to="/signup">
                פתיחת חשבון וקבלת הדוח המלא
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="lp-section">
        <h2>מה נבדק</h2>
        <div className="lp-grid">
          {CHECKS.map((c) => (
            <article className="card lp-check" key={c.title}>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2>למי זה מיועד</h2>
        <p className="lp-lead">
          לעסקים קטנים, עצמאיים ובעלי אתר בודד - מי שאין לו ספק אבטחה ואין לו מי שיבדוק את
          האתר אחרי שהוא הוקם. חברות גדולות כבר מכוסות; הפער נמצא כאן.
        </p>
        <p className="lp-lead">
          בנוסף, אנשי מקצוע שבונים אתרים יכולים לצרף לדוח חוות דעת אנושית משלהם - הלקוח מקבל
          גם את המספרים וגם מה לעשות איתם.
        </p>
      </section>

      <section className="lp-cta">
        <h2>בדיקה אחת, בעברית, בלי כרטיס אשראי</h2>
        <div className="lp-cta-row">
          <Link className="btn btn-primary" to="/signup">
            פתיחת חשבון
          </Link>
          <Link className="btn btn-secondary" to="/login">
            כבר יש לי חשבון
          </Link>
        </div>
      </section>

      <footer className="lp-footer">
        <Link to="/accessibility">הצהרת נגישות</Link>
      </footer>
    </main>
  );
}
