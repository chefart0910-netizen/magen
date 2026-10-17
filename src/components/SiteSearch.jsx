import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useLang } from "../lib/LangContext";

// MAGEN - חיפוש אישי מהיר מעל האתרים והממצאים של המשתמש המחובר (lib/routes/search.js).
// Debounce פשוט כדי לא להפציץ את ה-API בכל הקשה, ושני אוספי תוצאות קצרים - אתרים
// וממצאים - כל אחד עם קישור ישיר ליעד הרלוונטי.

const T = {
  he: {
    placeholder: "חיפוש אתרים או ממצאים...",
    sites: "אתרים",
    findings: "ממצאים",
    noResults: "אין תוצאות",
    searching: "מחפש...",
  },
  en: {
    placeholder: "Search sites or findings...",
    sites: "Sites",
    findings: "Findings",
    noResults: "No results",
    searching: "Searching...",
  },
};

export default function SiteSearch() {
  const { lang, path } = useLang();
  const t = T[lang] || T.he;
  const [q, setQ] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!q || q.trim().length < 2) {
      setResult(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const data = await api.search(q.trim());
        setResult(data);
      } catch {
        setResult({ sites: [], findings: [] });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const hasResults = result && (result.sites.length > 0 || result.findings.length > 0);

  return (
    <div className="site-search" ref={boxRef} style={{ position: "relative", minWidth: 240 }}>
      <input
        className="input"
        type="search"
        placeholder={t.placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label={t.placeholder}
      />

      {open && q.trim().length >= 2 && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            insetInlineStart: 0,
            insetInlineEnd: 0,
            zIndex: 20,
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {loading && <div className="text-dim" style={{ padding: 10 }}>{t.searching}</div>}

          {!loading && result && !hasResults && (
            <div className="text-dim" style={{ padding: 10 }}>{t.noResults}</div>
          )}

          {!loading && result && result.sites.length > 0 && (
            <div style={{ padding: "8px 10px" }}>
              <div className="sub" style={{ marginBottom: 4 }}>{t.sites}</div>
              {result.sites.map((site) => (
                <Link
                  key={site.id}
                  to={path(`/sites/${site.id}`)}
                  className="search-result-row"
                  style={{ display: "block", padding: "6px 0" }}
                  onClick={() => setOpen(false)}
                >
                  {site.label ? `${site.label} — ${site.url}` : site.url}
                </Link>
              ))}
            </div>
          )}

          {!loading && result && result.findings.length > 0 && (
            <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border, #e5e7eb)" }}>
              <div className="sub" style={{ marginBottom: 4 }}>{t.findings}</div>
              {result.findings.map((f, i) => (
                <Link
                  key={`${f.scan_id}-${i}`}
                  to={path(`/report/${f.scan_id}`)}
                  className="search-result-row"
                  style={{ display: "block", padding: "6px 0" }}
                  onClick={() => setOpen(false)}
                >
                  <div>{f.title}</div>
                  <div className="text-dim" style={{ fontSize: 12 }}>{f.site_url}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
