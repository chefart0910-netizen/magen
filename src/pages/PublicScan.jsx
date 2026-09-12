import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Seo from "../components/Seo";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLang } from "../lib/LangContext";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";

// MAGEN - עמוד תוצאה ציבורי לסריקה (/s/:slug).
// ==========================================================================================
// העמוד היחיד חוץ מעמוד הבית שנפתח לכל אחד ואינדקסבילי. הוא נוצר רק כשבעל אתר מאומת
// בחר לפרסם סריקה משלו (ראו lib/routes/scans.js -> /share).
//
// מה שאין כאן בכוונה: הוראות התיקון, פירוט האלמנטים והנתיבים, וזהות בעל האתר. גם ערך
// מסחרי וגם זהירות - אין סיבה לספק לתוקף מפת דרכים מסודרת לאתר.

function ScoreTile({ label, value }) {
  if (value === null || value === undefined) return null;
  const cls = value >= 90 ? "good" : value >= 70 ? "mid" : "bad";
  return (
    <div className={`ps-tile ps-${cls}`}>
      <div className="ps-tile-value">{value}</div>
      <div className="ps-tile-label">{label}</div>
    </div>
  );
}

export default function PublicScan() {
  const { slug } = useParams();
  const { t, path } = useLang();
  const P = t.publicScan;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .publicScanResult(slug)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [slug]);

  if (error) {
    return (
      <main className="lp">
        <Seo title={P.notFoundTitle} noindex />
        <div className="card empty-state">
          <div>{error}</div>
          <Link className="btn btn-primary" style={{ marginTop: 12 }} to={path("/")}>
            {P.newScan}
          </Link>
        </div>
      </main>
    );
  }

  if (!data) return <main className="lp"><p className="text-dim">{P.loading}</p></main>;

  const host = (() => {
    try {
      return new URL(data.site_url).hostname;
    } catch {
      return data.site_url;
    }
  })();

  return (
    <main className="lp">
      <Seo
        title={P.seoTitle(host)}
        description={P.seoDesc(host, formatDate(data.scanned_at))}
        path={`/s/${slug}`}
      />

      <div className="lp-top">
        <LanguageSwitcher />
      </div>

      <section className="ps-head">
        <p className="lp-eyebrow">{P.reportLabel}</p>
        <h1 className="lp-title" dir="ltr">
          {host}
        </h1>
        <p className="text-dim">{P.scannedAt(formatDate(data.scanned_at))}</p>
      </section>

      <section className="ps-tiles">
        <ScoreTile label={P.security} value={data.scores?.security} />
        <ScoreTile label={P.accessibility} value={data.scores?.accessibility} />
        <ScoreTile label={P.performance} value={data.scores?.performance} />
        <ScoreTile label={P.seo} value={data.scores?.seo} />
      </section>

      {data.preview?.length > 0 && (
        <section className="lp-section">
          <h2>{P.findingsTitle}</h2>
          <ul className="lp-findings">
            {data.preview.map((f, i) => (
              <li key={i}>
                <span className={`chip lp-sev-${f.severity}`}>
                  {t.severity[f.severity] || f.severity}
                </span>
                <span>{f.title}</span>
              </li>
            ))}
          </ul>
          {data.locked_count > 0 && (
            <p className="text-dim" style={{ marginTop: 12 }}>
              {P.more(data.locked_count)}
            </p>
          )}
        </section>
      )}

      <section className="lp-cta">
        <h2>{P.ctaTitle}</h2>
        <p className="text-dim" style={{ margin: "0 0 16px" }}>
          {P.ctaBody}
        </p>
        <div className="lp-cta-row">
          <Link className="btn btn-primary" to={path("/")}>
            {P.ctaBtn}
          </Link>
        </div>
      </section>
    </main>
  );
}
