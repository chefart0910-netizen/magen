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

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/sites", scansRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "שגיאת שרת פנימית" });
});

module.exports = app;
