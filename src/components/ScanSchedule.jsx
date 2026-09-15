import { useState } from "react";
import { api } from "../lib/api";

// MAGEN - תזמון סריקה אוטומטית לאתר.
// ==========================================================================================
// בדיקה חד-פעמית היא שירות שמשלמים עליו פעם אחת; "תגיד לי כשמשהו נשבר" הוא מנוי. זה
// הפאנל שמאפשר את השני.
//
// אין כאן המתנה לשרת לפני הציור: הערך הנוכחי מגיע מרשומת האתר שכבר נטענה, ולכן הפאנל
// נראה סופי מהרגע הראשון (אותו שיקול שתוקן ב-VerifyOwnership אחרי שנמדד CLS).

const OPTIONS = [
  { value: "off", label: "כבוי", hint: "בדיקות ידניות בלבד" },
  { value: "weekly", label: "שבועי", hint: "פעם בשבוע" },
  { value: "monthly", label: "חודשי", hint: "פעם בחודש" },
];

export default function ScanSchedule({ siteId, schedule, onChange }) {
  const [value, setValue] = useState(schedule || "off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const select = async (next) => {
    const previous = value;
    setValue(next);
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await api.setSchedule(siteId, next);
      setSaved(true);
      onChange?.(data.site);
    } catch (err) {
      setValue(previous); // החזרה למצב הקודם, כדי שהמסך לא יציג בחירה שלא נשמרה
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card vo">
      <h2 className="vo-title">סריקה אוטומטית</h2>
      <p className="text-dim vo-p">
        MAGEN יבדוק את האתר בעצמו לפי התזמון שתבחרו, והתוצאות ייכנסו להיסטוריית הבדיקות.
        כך רואים מגמה לאורך זמן ולא רק תמונת רגע.
      </p>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <fieldset className="form-field account-type">
        <legend className="label">תדירות</legend>
        {OPTIONS.map((o) => (
          <label className="choice" key={o.value}>
            <input
              type="radio"
              name={`schedule-${siteId}`}
              value={o.value}
              checked={value === o.value}
              disabled={busy}
              onChange={() => select(o.value)}
            />
            <span>
              <strong>{o.label}</strong>
              <span className="choice-hint">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {saved && <div className="success-banner">התזמון נשמר.</div>}

      <p className="text-dim vo-note">
        התראה במייל כשמשהו משתנה בציון עדיין לא פעילה — כרגע התוצאה מופיעה כאן בהיסטוריה.
      </p>
    </div>
  );
}
