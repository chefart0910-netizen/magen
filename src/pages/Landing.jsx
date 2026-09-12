import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Seo from "../components/Seo";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLang } from "../lib/LangContext";
import { api } from "../lib/api";

// MAGEN - עמוד הבית הציבורי.
// ==========================================================================================
// זה העמוד היחיד שגולש אנונימי וגוגל רואים, ולכן הוא צריך לומר בשורה אחת מה המוצר עושה
// ולמי. שדה הסריקה נמצא למעלה בכוונה: מבקר שמקבל ציון אמיתי על האתר שלו לפני הרשמה הוא
// מבקר שיש לו סיבה להירשם. התוצאה כאן חלקית - שלושה ממצאים בכותרת בלבד (ראו routes/public.js).
// כל הטקסטים מגיעים מ-lib/i18n.js, בעברית ובאנגלית.

export default function Landing() {
  const { t, path, lang } = useLang();
  const L = t.landing;

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!url.trim()) {
      setError(L.emptyUrl);
      return;
    }
    setLoading(true);
    try {
      setResult(await api.publicScan(url.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lp">
      <Seo title={L.titleA} description={L.lead} path="/" />
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "MAGEN",
            applicationCategory: "SecurityApplication",
            operatingSystem: "Web",
            inLanguage: lang === "he" ? "he-IL" : "en",
            description: L.lead,
            offers: { "@type": "Offer", price: "0", priceCurrency: "ILS" },
          })}
        </script>
      </Helmet>

      <div className="lp-top">
        <LanguageSwitcher />
      </div>

      <section className="lp-hero">
        <p className="lp-eyebrow">{L.eyebrow}</p>
        <h1 className="lp-title">
          <span className="hello">{L.titleA}</span>{" "}
          <span className="lp-title-dim">{L.titleB}</span>
        </h1>
        <p className="lp-lead">{L.lead}</p>

        <form className="lp-scan" onSubmit={submit}>
          <label className="label" htmlFor="lp-url">
            {L.urlLabel}
          </label>
          <div className="lp-scan-row">
            <input
              id="lp-url"
              className="input"
              type="text"
              inputMode="url"
              dir="ltr"
              placeholder={L.urlPlaceholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="url"
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? L.scanning : L.scanBtn}
            </button>
          </div>
          <p className="lp-scan-note">{L.passiveNote}</p>
        </form>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <p className="lp-loading" role="status">
            {L.loadingNote}
          </p>
        )}

        {result && (
          <div className="lp-result card" aria-live="polite">
            <div className="lp-result-head">
              <div>
                <div className="lp-result-label">{L.scoreLabel}</div>
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
              {Object.keys(t.severity).map((key) => (
                <div className="lp-sev-item" key={key}>
                  <span className={`lp-sev-count lp-sev-${key}`}>
                    {result.by_severity?.[key] ?? 0}
                  </span>
                  <span className="lp-sev-label">{t.severity[key]}</span>
                </div>
              ))}
            </div>

            {result.preview?.length > 0 ? (
              <>
                <h2 className="lp-result-sub">{L.findingsTitle}</h2>
                <ul className="lp-findings">
                  {result.preview.map((f, i) => (
                    <li key={i}>
                      <span className={`chip lp-sev-${f.severity}`}>
                        {t.severity[f.severity] || f.severity}
                      </span>
                      <span>{f.title}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="lp-clean">{L.clean}</p>
            )}

            <div className="lp-locked">
              <p>{result.locked_count > 0 ? L.lockedMore(result.locked_count) : L.lockedNone}</p>
              <Link className="btn btn-primary" to={path("/signup")}>
                {L.cta}
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="lp-section">
        <h2>{L.checksTitle}</h2>
        <div className="lp-grid">
          {L.checks.map((c) => (
            <article className="card lp-check" key={c.title}>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2>{L.audienceTitle}</h2>
        <p className="lp-lead">{L.audienceA}</p>
        <p className="lp-lead">{L.audienceB}</p>
      </section>

      <section className="lp-cta">
        <h2>{L.ctaTitle}</h2>
        <div className="lp-cta-row">
          <Link className="btn btn-primary" to={path("/signup")}>
            {L.ctaSignup}
          </Link>
          <Link className="btn btn-secondary" to={path("/login")}>
            {L.ctaLogin}
          </Link>
        </div>
      </section>

      <footer className="lp-footer">
        <Link to={path("/accessibility")}>{t.nav.accessibility}</Link>
      </footer>
    </main>
  );
}
