import { useLang } from "../lib/LangContext";

// מחלף שפה. כפתור ולא select: שתי אפשרויות בלבד, ולחיצה אחת עדיפה על תפריט.
// lang על הכפתור עצמו כדי שקורא מסך יהגה את שם השפה השנייה נכון ולא במבטא של הנוכחית.
export default function LanguageSwitcher({ className = "" }) {
  const { t, otherLang, switchLang } = useLang();

  return (
    <button
      type="button"
      className={`btn btn-sm btn-secondary lang-switch ${className}`}
      onClick={switchLang}
      lang={otherLang}
      aria-label={`${t.switchLabel}: ${t.switchTo}`}
    >
      {t.switchTo}
    </button>
  );
}
