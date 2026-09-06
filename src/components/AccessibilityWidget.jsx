import { useEffect, useRef, useState } from "react";

// MAGEN - תפריט נגישות צף.
// ==========================================================================================
// חשוב להבנה: הווידג'ט הזה *אינו* הופך אתר לנגיש, ואינו תחליף לקוד נגיש. הוא נותן למשתמש
// שליטה על מספר התאמות תצוגה נפוצות, ומספק את הנוכחות הגלויה שגולשים בישראל מצפים לה.
// הנגישות האמיתית נמצאת בקוד עצמו - סמנטיקה, ניווט מקלדת, ניגודיות וטקסט חלופי.
//
// ההעדפות נשמרות ב-localStorage ומוחלות כ-data attributes על <html>, כך שכל העיצוב
// מתבצע ב-CSS ולא ב-JavaScript.

const STORAGE_KEY = "magen_a11y";

const DEFAULTS = { zoom: 1, contrast: "normal", links: "off", motion: "on" };

const ZOOM_STEPS = [0.9, 1, 1.15, 1.3, 1.5];

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    return { ...DEFAULTS };
  }
}

function applyPrefs(prefs) {
  const root = document.documentElement;
  root.style.setProperty("--a11y-zoom", String(prefs.zoom));
  root.dataset.a11yContrast = prefs.contrast;
  root.dataset.a11yLinks = prefs.links;
  root.dataset.a11yMotion = prefs.motion;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    // גלישה פרטית או אחסון חסום - ההעדפה עדיין תקפה לסשן הנוכחי.
  }
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    applyPrefs(prefs);
  }, [prefs]);

  // Escape סוגר ומחזיר את המיקוד לכפתור - בלי זה משתמש מקלדת "נתקע" בתוך התפריט.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClickOutside = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  const update = (patch) => setPrefs((p) => ({ ...p, ...patch }));

  const stepZoom = (direction) => {
    const index = ZOOM_STEPS.indexOf(prefs.zoom);
    const current = index === -1 ? 1 : index;
    const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, current + direction));
    update({ zoom: ZOOM_STEPS[next] });
  };

  const reset = () => setPrefs({ ...DEFAULTS });

  const zoomPercent = Math.round(prefs.zoom * 100);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="a11y-fab"
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label={open ? "סגירת תפריט נגישות" : "פתיחת תפריט נגישות"}
        onClick={() => setOpen((v) => !v)}
      >
        {/* אייקון הנגישות המוכר. aria-hidden כי הכפתור כבר נושא שם נגיש. */}
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="6.4" r="1.7" fill="currentColor" />
          <path
            d="M5.6 9.1c2 .7 4.1 1.1 6.4 1.1s4.4-.4 6.4-1.1M12 10.2v4.2m0 0l-2.4 4.9M12 14.4l2.4 4.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          id="a11y-panel"
          className="a11y-panel"
          role="dialog"
          aria-label="הגדרות נגישות"
        >
          <h2 className="a11y-title">הגדרות נגישות</h2>

          <div className="a11y-group">
            <span className="a11y-label" id="a11y-text-size">גודל טקסט</span>
            <div className="a11y-row" role="group" aria-labelledby="a11y-text-size">
              <button type="button" className="a11y-btn" onClick={() => stepZoom(-1)} aria-label="הקטנת טקסט">
                א-
              </button>
              <output className="a11y-value" aria-live="polite">{zoomPercent}%</output>
              <button type="button" className="a11y-btn" onClick={() => stepZoom(1)} aria-label="הגדלת טקסט">
                א+
              </button>
            </div>
          </div>

          <div className="a11y-group">
            <label className="a11y-toggle">
              <input
                type="checkbox"
                checked={prefs.contrast === "high"}
                onChange={(e) => update({ contrast: e.target.checked ? "high" : "normal" })}
              />
              <span>ניגודיות גבוהה</span>
            </label>

            <label className="a11y-toggle">
              <input
                type="checkbox"
                checked={prefs.links === "on"}
                onChange={(e) => update({ links: e.target.checked ? "on" : "off" })}
              />
              <span>הדגשת קישורים</span>
            </label>

            <label className="a11y-toggle">
              <input
                type="checkbox"
                checked={prefs.motion === "off"}
                onChange={(e) => update({ motion: e.target.checked ? "off" : "on" })}
              />
              <span>עצירת אנימציות</span>
            </label>
          </div>

          <button type="button" className="a11y-reset" onClick={reset}>
            איפוס הגדרות
          </button>

          <a className="a11y-statement-link" href="/accessibility">
            הצהרת הנגישות שלנו
          </a>
        </div>
      )}
    </>
  );
}
