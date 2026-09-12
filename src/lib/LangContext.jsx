import { createContext, useContext, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { detectLang, dictFor, dirFor, localizePath, STORAGE_KEY } from "./i18n";

// MAGEN - הקשר השפה.
// ==========================================================================================
// מקור האמת לשפה הוא הכתובת, לא state: /en/... זו אנגלית, כל השאר עברית. כך קישור
// שנשלח ללקוח נפתח אצלו באותה שפה שבה נשלח, וגוגל מאנדקס שתי גרסאות נפרדות.
//
// המחלף לא "מתרגם במקום" - הוא מנווט לאותו עמוד בכתובת של השפה השנייה, ושומר את
// הבחירה כדי שביקור הבא יתחיל ישר בשפה הנכונה.

const LangContext = createContext(null);

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang חייב להיות בתוך LangProvider");
  return ctx;
}

export function LangProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const lang = location.pathname === "/en" || location.pathname.startsWith("/en/") ? "en" : "he";
  const dir = dirFor(lang);

  // lang ו-dir על תגית ה-html: זה מה שמשפיע על כיוון הטקסט, על הגיית קוראי מסך,
  // ועל האופן שבו גוגל מזהה את שפת העמוד. index.html מגיע עם he/rtl, וכאן זה מתוקן.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo(() => {
    // הנתיב בלי קידומת השפה - הבסיס לבניית הקישור המקביל בשפה האחרת.
    const bare = lang === "en" ? location.pathname.replace(/^\/en/, "") || "/" : location.pathname;

    return {
      lang,
      dir,
      t: dictFor(lang),
      // בונה כתובת פנימית בשפה הנוכחית. כל <Link> באזור הציבורי עובר דרך זה.
      path: (p) => localizePath(p, lang),
      otherLang: lang === "he" ? "en" : "he",
      switchLang: () => {
        const next = lang === "he" ? "en" : "he";
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // אחסון חסום - השפה עדיין מתחלפת, רק לא נזכרת.
        }
        navigate(localizePath(bare, next) + location.search, { replace: false });
      },
    };
  }, [lang, dir, location.pathname, location.search, navigate]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

// מפנה מבקר חדש בשורש לשפה של הדפדפן שלו. עברית נשארת בשורש, כל שפה אחרת -> /en.
// רק בשורש ורק פעם אחת: מי שהגיע לכתובת מפורשת (כולל קישור ששותף) לא מופנה לשום מקום.
export function useRootLanguageRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== "/") return;
    if (detectLang() === "he") return;
    navigate("/en" + location.search, { replace: true });
  }, [location.pathname, location.search, navigate]);
}
