// MAGEN - נקודת כניסה ל-Vercel Serverless Function.
// עוטפת את אותה אפליקציית Express כמו backend/src/index.js. מסד הנתונים הוא Turso (libSQL
// מנוהל חיצוני, ראו lib/db.js) - לא node:sqlite מקומי - כדי שנתונים לא יתאפסו בין "קרים"
// (cold starts) שונים של הפונקציה, שאין לה דיסק קבוע.
require("dotenv").config();

const express = require("express");
const cors = require("cors");

process.on("unhandledRejection", (reason) => {
  console.error("אזהרה: Unhandled Promise Rejection (השרת ממשיך לרוץ):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("אזהרה: Uncaught Exception (השרת ממשיך לרוץ):", err);
});

const authRoutes = require("../lib/routes/auth");
const sitesRoutes = require("../lib/routes/sites");
const scansRoutes = require("../lib/routes/scans");
const adminRoutes = require("../lib/routes/admin");
const reviewsRoutes = require("../lib/routes/reviews");
const scanCallbackRoutes = require("../lib/routes/scan-callback");
const publicRoutes = require("../lib/routes/public");
const grantsRoutes = require("../lib/routes/grants");

const app = express();

// ה-frontend מוגש מאותו origin וקורא ל-/api בנתיב יחסי, ולכן הוא לא זקוק ל-CORS בכלל.
// cors() ללא ארגומנטים היה מחזיר Access-Control-Allow-Origin: * לכל בקשה - כלומר כל אתר זר
// יכול היה לקרוא תשובות מה-API. ברירת המחדל כאן היא לא לפרסם CORS כלל; אם בעתיד יידרש
// לקוח ממקור אחר (אפליקציה, תוסף), מגדירים CORS_ALLOWED_ORIGINS כרשימה מופרדת בפסיקים.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: allowedOrigins.length > 0,
  })
);
app.use(express.json({ limit: "1mb" }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// מפת האתר של עמודי התוצאה שפורסמו, בכתובת ציבורית ולא תחת /api.
// למה כאן ולא רק ב-router: ב-vercel.json יש rewrite מ-/sitemap-scans.xml לפונקציה הזו.
// Vercel לא משרשרת rewrites, ולכן rewrite שמצביע על /api/public/sitemap.xml נכשל ב-404 -
// הוא מחפש קובץ פלט בשם הזה. הפתרון: ה-rewrite מצביע על /api, הפונקציה רואה את הנתיב
// המקורי, ו-Express מטפל בו כאן.
app.get("/sitemap-scans.xml", publicRoutes.sitemapHandler);

// ללא requireAuth בכוונה - זו סריקת הטעימה של עמוד הבית. ההגנות (הגבלת קצב, חסימת
// כתובות פנימיות, תוצאה חלקית) נמצאות בתוך lib/routes/public.js.
app.use("/api/public", publicRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/sites", scansRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/grants", grantsRoutes);
// ללא requireAuth בכוונה - הקורא הוא ה-runner של GitHub Actions, שמזדהה בסוד משותף.
app.use("/api/scan-callback", scanCallbackRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "שגיאת שרת פנימית" });
});

module.exports = app;
