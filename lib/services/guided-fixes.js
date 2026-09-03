// MAGEN - "תיקון מודרך" לממצאי נגישות (axe-core): מוסיף לכל ממצא הסבר בעברית + צעד תיקון
// מעשי, כדי שהמשתמש לא יישאר עם קוד שגיאה טכני בלבד. מבוסס על מאגר כללים נפוצים של axe-core
// (WCAG) עם נפילה חינה (fallback) גנרית לכללים שלא מופו במפורש.

// מפתח = axe rule id (v.id). מקור הרשימה: כללי axe-core הנפוצים ביותר במחקרי WebAIM Million.
const GUIDED_FIXES = {
  "image-alt": {
    summary: "לתמונה חסר טקסט חלופי (alt)",
    fix: 'הוסיפו תכונת alt="..." תיאורית לכל <img>. לתמונות דקורטיביות בלבד השתמשו ב-alt="" ריק.',
    wcag: "1.1.1",
  },
  "color-contrast": {
    summary: "ניגודיות צבעים בין טקסט לרקע נמוכה מדי",
    fix: "הגבירו את הניגודיות ליחס של 4.5:1 לפחות (טקסט רגיל) או 3:1 (טקסט גדול/מודגש).",
    wcag: "1.4.3",
  },
  label: {
    summary: "לשדה טופס חסרה תווית (label) מקושרת",
    fix: "קשרו <label for=\"id\"> לכל שדה קלט, או הוסיפו aria-label / aria-labelledby.",
    wcag: "1.3.1, 4.1.2",
  },
  "link-name": {
    summary: "לקישור אין טקסט נגיש (או שהוא ריק)",
    fix: "הוסיפו טקסט תיאורי בתוך הקישור, או aria-label אם יש בו רק אייקון.",
    wcag: "2.4.4, 4.1.2",
  },
  "button-name": {
    summary: "לכפתור אין טקסט נגיש",
    fix: "הוסיפו טקסט גלוי בתוך ה-<button>, או aria-label לכפתורי אייקון בלבד.",
    wcag: "4.1.2",
  },
  "html-has-lang": {
    summary: "לתגית ה-<html> חסרה תכונת lang",
    fix: 'הוסיפו <html lang="he"> (או קוד השפה המתאים) לתחילת המסמך.',
    wcag: "3.1.1",
  },
  "document-title": {
    summary: "לעמוד חסרה תגית <title> תיאורית",
    fix: "הוסיפו <title> ייחודי ומתאר את תוכן העמוד בתוך ה-<head>.",
    wcag: "2.4.2",
  },
  "duplicate-id": {
    summary: "נמצא מזהה (id) כפול באותו עמוד",
    fix: "ודאו שכל ערך id ייחודי בעמוד - id כפול שובר קריאי מסך ואינטראקציית מקלדת.",
    wcag: "4.1.1",
  },
  "aria-required-attr": {
    summary: "חסרה תכונת ARIA שנדרשת עבור ה-role שהוגדר",
    fix: "בדקו את מפרט ה-ARIA עבור ה-role הרלוונטי והוסיפו את התכונות החובה החסרות.",
    wcag: "4.1.2",
  },
  "landmark-one-main": {
    summary: "לעמוד חסר landmark יחיד מסוג <main>",
    fix: "עטפו את התוכן המרכזי של העמוד בתגית <main> אחת.",
    wcag: "1.3.1",
  },
  "meta-viewport": {
    summary: "תג ה-viewport חוסם זום/שינוי קנה מידה למשתמש",
    fix: 'הסירו user-scalable=no ו-maximum-scale מתגית <meta name="viewport">.',
    wcag: "1.4.4",
  },
  "frame-title": {
    summary: "ל-<iframe> חסרה תכונת title תיאורית",
    fix: 'הוסיפו title="..." תיאורי לכל <iframe> כדי שקוראי מסך יזהו את תוכנו.',
    wcag: "4.1.2",
  },
};

const DEFAULT_FIX = {
  summary: "נמצא ממצא נגישות שדורש בדיקה ידנית",
  fix: "עיינו בקישור התיעוד המצורף (help_url) להסבר המלא ולדוגמת תיקון עבור כלל זה.",
  wcag: null,
};

// מעשיר ממצא axe-core בודד עם הסבר וצעד תיקון מעשי בעברית. לא נכשל לעולם - כלל לא מוכר
// מקבל נפילה חינה גנרית במקום לזרוק שגיאה ולהפיל את כל הסריקה.
function enrichViolationWithGuidedFix(violation) {
  const guide = GUIDED_FIXES[violation.id] || DEFAULT_FIX;
  return {
    ...violation,
    guided_fix: {
      summary: guide.summary,
      fix: guide.fix,
      wcag: guide.wcag,
    },
  };
}

module.exports = { enrichViolationWithGuidedFix, GUIDED_FIXES };
