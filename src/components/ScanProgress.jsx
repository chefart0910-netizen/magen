import { useEffect, useState } from "react";

// MAGEN - מה קורה בזמן שהסריקה רצה.
// ==========================================================================================
// למה זה קיים: סריקה בסיסית לא רצה על השרת שלנו אלא על runner חיצוני עם דפדפן אמיתי,
// ולכן היא לוקחת דקות - באתר GIS ממשלתי נמדדו 6 דקות ו-4 שניות מקצה לקצה. ספינר אילם
// במשך שש דקות נקרא "תקוע", וגם מי שבנה את המערכת חשב כך. לקוח פשוט יסגור את הטאב.
//
// לכן הפאנל הזה אומר שלושה דברים מפורשות: מה קורה עכשיו, כמה זמן זה לוקח בדרך כלל,
// ושמותר לעזוב את הדף. הטיימר הוא סימן חיים - הוא מבדיל בין "עובד" ל"נתקע".

const STAGES = [
  { until: 25, text: "שולחים את הבקשה לשרת הבדיקות…" },
  { until: 70, text: "מכינים סביבת דפדפן נקייה על השרת…" },
  { until: 150, text: "טוענים את האתר בדפדפן אמיתי ומודדים ביצועים…" },
  { until: 240, text: "בודקים נגישות מול כללי WCAG…" },
  { until: Infinity, text: "מסיימים ומחשבים ציונים…" },
];

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ScanProgress({ startedAt, label }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const stage = STAGES.find((s) => elapsed < s.until);
  // מעל 4 דקות זה עדיין תקין, אבל צריך לומר את זה - אחרת ההמתנה נקראת ככשל.
  const heavy = elapsed >= 240;

  return (
    <div className="card sp" role="status" aria-live="polite">
      <div className="sp-head">
        <span className="spinner" />
        <div>
          <div className="sp-title">{label || "הבדיקה רצה"}</div>
          <div className="sp-stage">{stage.text}</div>
        </div>
        <div className="sp-timer" aria-label="זמן שעבר">
          {fmt(elapsed)}
        </div>
      </div>

      <p className="sp-note">
        הבדיקה רצה על דפדפן אמיתי בשרת חיצוני, ולכן היא לוקחת בדרך כלל <strong>2–4 דקות</strong>.
        אתרים כבדים יכולים להגיע ל־6 דקות ויותר. <strong>אפשר לעזוב את הדף</strong> — התוצאה
        נשמרת ותופיע בהיסטוריית הבדיקות.
      </p>

      {heavy && (
        <div className="info-banner sp-heavy">
          האתר הזה כבד וטעינתו אורכת זמן. הבדיקה ממשיכה לרוץ — זו לא תקלה.
        </div>
      )}
    </div>
  );
}
