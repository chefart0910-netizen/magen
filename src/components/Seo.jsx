import { Helmet } from "react-helmet-async";

// MAGEN - תגיות ה-head לכל עמוד.
// ==========================================================================================
// ה-title וה-description שב-index.html זהים לכל האתר, ולכן גוגל רואה את כל העמודים כעמוד
// אחד. הקומפוננטה הזו נותנת לכל עמוד כותרת ותיאור משלו, ותגיות Open Graph כדי שקישור
// שמשותף בוואטסאפ יציג תצוגה מקדימה.
//
// noindex: עמודים פרטיים (דשבורד, דוחות, ניהול) לא אמורים להופיע בגוגל גם אם נדלפה כתובת.

const SITE_NAME = "MAGEN";
const DEFAULT_IMAGE = "/og-image.png";

export default function Seo({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  noindex = false,
}) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - בריאות האתר שלך`;
  const origin = window.location.origin;
  const url = path ? `${origin}${path}` : window.location.href;
  // og:image חייב להיות כתובת מלאה. וואטסאפ ופייסבוק לא פותרים נתיב יחסי, והתוצאה
  // היא קישור בלי תצוגה מקדימה - בדיוק מה שהתמונה באה לפתור.
  const imageUrl = /^https?:\/\//i.test(image) ? image : `${origin}${image}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="he_IL" />
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
