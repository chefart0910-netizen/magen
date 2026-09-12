import { Helmet } from "react-helmet-async";
import { useLang } from "../lib/LangContext";
import { localizePath } from "../lib/i18n";

// MAGEN - תגיות ה-head לכל עמוד.
// ==========================================================================================
// ה-title וה-description שב-index.html זהים לכל האתר, ולכן גוגל רואה את כל העמודים כעמוד
// אחד. הקומפוננטה הזו נותנת לכל עמוד כותרת ותיאור משלו, ותגיות Open Graph כדי שקישור
// שמשותף בוואטסאפ יציג תצוגה מקדימה.
//
// hreflang: לכל עמוד ציבורי יש שתי כתובות - עברית בשורש ואנגלית תחת /en. בלי התגיות
// האלה גוגל מתייחס אליהן כשני עמודים מתחרים על אותו תוכן במקום כשתי גרסאות שפה.
// x-default מצביע על העברית, כי זה השוק הראשון.
//
// noindex: עמודים פרטיים (דשבורד, דוחות, ניהול) לא אמורים להופיע בגוגל גם אם נדלפה כתובת.

const SITE_NAME = "MAGEN";
const DEFAULT_IMAGE = "/og-image.png";

export default function Seo({ title, description, path, image = DEFAULT_IMAGE, noindex = false }) {
  const { lang, t } = useLang();

  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - ${t.brandTagline}`;
  const origin = window.location.origin;
  const url = path ? `${origin}${localizePath(path, lang)}` : window.location.href;
  // og:image חייב להיות כתובת מלאה. וואטסאפ ופייסבוק לא פותרים נתיב יחסי, והתוצאה
  // היא קישור בלי תצוגה מקדימה - בדיוק מה שהתמונה באה לפתור.
  const imageUrl = /^https?:\/\//i.test(image) ? image : `${origin}${image}`;

  return (
    <Helmet>
      <html lang={lang} />
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {!noindex && path && (
        <link rel="alternate" hrefLang="he" href={`${origin}${localizePath(path, "he")}`} />
      )}
      {!noindex && path && (
        <link rel="alternate" hrefLang="en" href={`${origin}${localizePath(path, "en")}`} />
      )}
      {!noindex && path && (
        <link rel="alternate" hrefLang="x-default" href={`${origin}${localizePath(path, "he")}`} />
      )}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content={lang === "he" ? "he_IL" : "en_US"} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={url} />
      <meta property="og:image" content={imageUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={imageUrl} />
    </Helmet>
  );
}
