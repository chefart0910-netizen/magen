// MAGEN - שליחת מייל.
// ==========================================================================================
// נקודה אחת שכל המערכת שולחת דרכה. כרגע יש ספק אחד (Resend, דרך ה-HTTP API שלהם - אין
// צורך בחבילה), וכשהוא לא מוגדר השליחה לא נכשלת: היא מחזירה { sent: false } והקורא מחליט
// מה לעשות. כך "שכחתי סיסמה" יכול לעלות לאוויר לפני שיש דומיין, ולהתחיל לעבוד ברגע
// שמגדירים שני משתני סביבה - בלי שינוי קוד.
//
// משתנים:  RESEND_API_KEY   - מפתח ה-API
//          MAIL_FROM        - כתובת שולח מדומיין מאומת, למשל "MAGEN <no-reply@magenscan.com>"
//
// מה *לא* נכתב ליומן: גוף ההודעה. במייל איפוס סיסמה הגוף מכיל את האסימון, ויומני Vercel
// אינם מקום לסודות - מי שקורא אותם היה יכול להשתלט על החשבון.

const RESEND_URL = "https://api.resend.com/emails";

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

async function sendMail({ to, subject, text, html }) {
  if (!isConfigured()) {
    console.warn(`mailer: לא מוגדר (RESEND_API_KEY / MAIL_FROM) - מייל "${subject}" לא נשלח`);
    return { sent: false, reason: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`mailer: Resend החזיר ${res.status}: ${body.slice(0, 300)}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("mailer: שליחה נכשלה:", err?.message || err);
    return { sent: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendMail, isConfigured };
