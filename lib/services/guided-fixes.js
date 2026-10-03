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
  // --- הרחבה 2026-10-03: כללים שהופיעו בסריקות אמיתיות וקיבלו עד עכשיו את הנפילה הגנרית ---
  "aria-allowed-role": {
    summary: "לרכיב הוגדר role שאינו מתאים לסוג שלו",
    fix: "הסירו את תכונת role מהרכיב, או החליפו את הרכיב באלמנט HTML שמתאים לתפקיד (למשל <button> במקום div עם role=\"button\").",
    wcag: "4.1.2",
  },
  "aria-prohibited-attr": {
    summary: "הוגדרה תכונת ARIA שאסורה על הרכיב הזה",
    fix: "הסירו את aria-label / aria-labelledby מרכיב שאין לו תפקיד מתאים (למשל div או span רגילים), או תנו לו role מתאים.",
    wcag: "4.1.2",
  },
  "page-has-heading-one": {
    summary: "לעמוד אין כותרת ראשית (h1)",
    fix: "הוסיפו כותרת <h1> אחת שמתארת את נושא העמוד. קוראי מסך משתמשים בה כדי להבין איפה הם נמצאים.",
    wcag: "1.3.1",
  },
  "presentation-role-conflict": {
    summary: "רכיב סומן כדקורטיבי אך עדיין נגיש למקלדת או לקוראי מסך",
    fix: "לרכיב עם role=\"presentation\" או role=\"none\" אסור שתהיה תכונת ARIA גלובלית או tabindex. הסירו אותן, או הסירו את ה-role.",
    wcag: "1.3.1",
  },
  tabindex: {
    summary: "ערך tabindex חיובי משבש את סדר הניווט במקלדת",
    fix: "החליפו tabindex חיובי (1 ומעלה) ב-0 או הסירו אותו, וסדרו את הרכיבים בקוד לפי הסדר הרצוי.",
    wcag: "2.4.3",
  },
  "heading-order": {
    summary: "רמות הכותרות מדלגות (למשל מ-h2 ל-h4)",
    fix: "שמרו על רצף הכותרות בלי לדלג על רמה. גודל התצוגה נקבע ב-CSS, לא בבחירת רמת הכותרת.",
    wcag: "1.3.1",
  },
  region: {
    summary: "חלק מתוכן העמוד נמצא מחוץ לאזורי ציון (landmarks)",
    fix: "עטפו את התוכן באזורים סמנטיים: <header>, <nav>, <main>, <footer>.",
    wcag: "1.3.1",
  },
  list: {
    summary: "רשימה (ul/ol) מכילה רכיבים שאינם פריטי רשימה",
    fix: "בתוך <ul> או <ol> מותרים רק <li> (וגם <script>/<template>).",
    wcag: "1.3.1",
  },
  listitem: {
    summary: "פריט רשימה (li) נמצא מחוץ לרשימה",
    fix: "עטפו כל <li> ברכיב <ul> או <ol>.",
    wcag: "1.3.1",
  },
  "aria-hidden-focus": {
    summary: "רכיב מוסתר מקוראי מסך אך עדיין מקבל פוקוס במקלדת",
    fix: "לרכיב עם aria-hidden=\"true\" הוסיפו tabindex=\"-1\" לכל מה שבתוכו, או הסירו את aria-hidden.",
    wcag: "4.1.2",
  },
  "aria-valid-attr-value": {
    summary: "ערך לא תקין בתכונת ARIA",
    fix: "בדקו שהערך מותר לתכונה (למשל aria-expanded רק true/false) ושמזהים ב-aria-controls / aria-labelledby קיימים בעמוד.",
    wcag: "4.1.2",
  },
  "aria-valid-attr": {
    summary: "תכונת ARIA שאינה קיימת (שגיאת כתיב)",
    fix: "תקנו את שם התכונה לשם ARIA תקני, או הסירו אותה.",
    wcag: "4.1.2",
  },
  "nested-interactive": {
    summary: "רכיב לחיץ מקונן בתוך רכיב לחיץ אחר",
    fix: "אל תשימו קישור או כפתור בתוך כפתור או קישור. הפרידו אותם לרכיבים נפרדים.",
    wcag: "4.1.2",
  },
  "scrollable-region-focusable": {
    summary: "אזור גלילה שאי אפשר להגיע אליו במקלדת",
    fix: "הוסיפו tabindex=\"0\" לאזור הנגלל, או ודאו שיש בתוכו רכיב שמקבל פוקוס.",
    wcag: "2.1.1",
  },
  "select-name": {
    summary: "לרשימה נפתחת (select) אין שם נגיש",
    fix: "קשרו <label> לרשימה, או הוסיפו aria-label.",
    wcag: "4.1.2",
  },
  "input-button-name": {
    summary: "לכפתור מסוג input אין טקסט נגיש",
    fix: "הוסיפו value=\"...\" או aria-label לכפתור.",
    wcag: "4.1.2",
  },
  "empty-heading": {
    summary: "כותרת ריקה",
    fix: "הוסיפו טקסט לכותרת, או הסירו את תגית הכותרת אם היא משמשת רק לעיצוב.",
    wcag: "1.3.1",
  },
  "link-in-text-block": {
    summary: "קישור בתוך פסקה מובחן מהטקסט רק בצבע",
    fix: "הוסיפו קו תחתון או סימון נוסף שאינו צבע, או ניגודיות של 3:1 לפחות מול הטקסט שסביבו.",
    wcag: "1.4.1",
  },
  "html-lang-valid": {
    summary: "שפת העמוד מוגדרת בקוד לא תקין",
    fix: "השתמשו בקוד שפה תקני בתגית html, למשל lang=\"he\" או lang=\"en\".",
    wcag: "3.1.1",
  },
  "valid-lang": {
    summary: "קוד שפה לא תקין בתכונת lang של רכיב",
    fix: "תקנו את ערך lang לקוד שפה תקני.",
    wcag: "3.1.2",
  },
  "image-redundant-alt": {
    summary: "הטקסט החלופי של תמונה חוזר על הטקסט שלידה",
    fix: "קצרו את ה-alt או השאירו אותו ריק (alt=\"\") כשהטקסט הסמוך כבר מתאר את התמונה.",
    wcag: "1.1.1",
  },
  "svg-img-alt": {
    summary: "לאיור SVG עם role=\"img\" אין טקסט חלופי",
    fix: "הוסיפו <title> בתוך ה-SVG או aria-label.",
    wcag: "1.1.1",
  },
  "role-img-alt": {
    summary: "לרכיב עם role=\"img\" אין טקסט חלופי",
    fix: "הוסיפו aria-label או aria-labelledby שמתארים את התמונה.",
    wcag: "1.1.1",
  },
  "input-image-alt": {
    summary: "לכפתור תמונה (input type=image) אין טקסט חלופי",
    fix: "הוסיפו alt=\"...\" שמתאר את פעולת הכפתור.",
    wcag: "1.1.1",
  },
  "duplicate-id-aria": {
    summary: "מזהה (id) שמשמש את ARIA מופיע יותר מפעם אחת",
    fix: "תנו לכל רכיב id ייחודי, במיוחד כשהוא מוזכר ב-aria-labelledby או ב-label for.",
    wcag: "4.1.2",
  },
  "landmark-unique": {
    summary: "שני אזורי ציון זהים בלי שם שמבדיל ביניהם",
    fix: "הוסיפו aria-label שונה לכל אזור (למשל שני <nav>: \"ראשי\" ו\"תחתון\").",
    wcag: "1.3.1",
  },
  "landmark-no-duplicate-banner": {
    summary: "בעמוד יש יותר מאזור כותרת עליונה אחד (banner)",
    fix: "השאירו <header> ראשי אחד ברמת העמוד.",
    wcag: "1.3.1",
  },
  "landmark-complementary-is-top-level": {
    summary: "אזור צדדי (aside) מקונן בתוך אזור אחר",
    fix: "העבירו את ה-<aside> לרמה העליונה של העמוד, מחוץ ל-<main> ולאזורים אחרים.",
    wcag: "1.3.1",
  },
  "aria-command-name": {
    summary: "לכפתור או לקישור מבוססי ARIA אין שם נגיש",
    fix: "הוסיפו טקסט פנימי או aria-label לרכיב.",
    wcag: "4.1.2",
  },
  "aria-input-field-name": {
    summary: "לשדה קלט מבוסס ARIA אין שם נגיש",
    fix: "הוסיפו aria-label או aria-labelledby לשדה.",
    wcag: "4.1.2",
  },
  "aria-toggle-field-name": {
    summary: "למתג (checkbox / switch) מבוסס ARIA אין שם נגיש",
    fix: "הוסיפו aria-label או טקסט פנימי למתג.",
    wcag: "4.1.2",
  },
  "aria-dialog-name": {
    summary: "לחלון קופץ (dialog) אין שם נגיש",
    fix: "הוסיפו aria-labelledby שמצביע על כותרת החלון, או aria-label.",
    wcag: "4.1.2",
  },
  "autocomplete-valid": {
    summary: "ערך autocomplete לא תקין בשדה טופס",
    fix: "השתמשו בערכים התקניים (name, email, tel וכו') כדי שהדפדפן יוכל למלא אוטומטית.",
    wcag: "1.3.5",
  },
  "target-size": {
    summary: "אזור הלחיצה קטן מדי",
    fix: "הגדילו כפתורים וקישורים ל-24x24 פיקסלים לפחות, או הרחיקו אותם זה מזה.",
    wcag: "2.5.8",
  },
  bypass: {
    summary: "אין דרך לדלג על התפריט ישר לתוכן",
    fix: "הוסיפו קישור \"דלג לתוכן\" בתחילת העמוד, או אזור <main> שקוראי מסך מזהים.",
    wcag: "2.4.1",
  },
  "meta-refresh": {
    summary: "העמוד מתרענן או מפנה אוטומטית אחרי זמן קצוב",
    fix: "הסירו את <meta http-equiv=\"refresh\">, או בצעו את ההפניה בצד השרת.",
    wcag: "2.2.1",
  },
  "object-alt": {
    summary: "לרכיב <object> אין טקסט חלופי",
    fix: "הוסיפו טקסט בתוך התגית או aria-label.",
    wcag: "1.1.1",
  },
  "video-caption": {
    summary: "לסרטון אין כתוביות",
    fix: "הוסיפו קובץ כתוביות עם <track kind=\"captions\">.",
    wcag: "1.2.2",
  },
  "form-field-multiple-labels": {
    summary: "לשדה טופס מקושרות כמה תוויות",
    fix: "השאירו תווית <label> אחת לכל שדה.",
    wcag: "3.3.2",
  },
  "label-title-only": {
    summary: "שדה טופס מתויג רק באמצעות title",
    fix: "הוסיפו <label> גלויה. title לבד לא מוצג לכולם ולא נקרא באופן עקבי.",
    wcag: "3.3.2",
  },
};

// הנפילה הגנרית. הנוסח הקודם ("דורש בדיקה ידנית", "help_url") היה מטעה ללקוח - הממצא
// נמצא אוטומטית - וחשף שם שדה טכני בדוח. עכשיו הוא אומר מה זה ואיפה ההסבר.
const DEFAULT_FIX = {
  summary: "ממצא נגישות אוטומטי",
  fix: "ההסבר המלא ודוגמת תיקון נמצאים בקישור לתיעוד הכלל, בדוח המלא באתר.",
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
