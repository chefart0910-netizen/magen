// MAGEN - הגדרות התראות מעקב של המשתמש (webhook + הפעלה/כיבוי מייל/webhook).
// ראו lib/services/alerts.js להגדרת ה-gate לפי חבילה: webhook רק למי שאינו בחבילה
// החינמית, בדיוק כמו שדוח חלקי/מלא נגזר מ-req.user.plan ב-routes/scans.js.

const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ah } = require("../async-handler");
const { webhookAllowed } = require("../services/alerts");

const router = express.Router();
router.use(requireAuth);

function isValidWebhookUrl(url) {
  if (!url) return true; // ריק = ביטול ההגדרה, תקין תמיד.
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// GET /api/account/alerts - ההגדרות הנוכחיות.
router.get(
  "/alerts",
  ah(async (req, res) => {
    const row = await db
      .prepare("SELECT webhook_url, alerts_email_enabled, alerts_webhook_enabled FROM users WHERE id = ?")
      .get(req.user.id);

    res.json({
      webhook_url: row?.webhook_url || "",
      alerts_email_enabled: !!row?.alerts_email_enabled,
      alerts_webhook_enabled: !!row?.alerts_webhook_enabled,
      webhook_allowed: webhookAllowed(req.user),
    });
  })
);

// PATCH /api/account/alerts - שמירת כתובת ה-webhook והפעלה/כיבוי סוגי ההתראה.
router.patch(
  "/alerts",
  ah(async (req, res) => {
    const { webhook_url, alerts_email_enabled, alerts_webhook_enabled } = req.body || {};

    if (webhook_url !== undefined && !isValidWebhookUrl(webhook_url)) {
      return res.status(400).json({ error: "כתובת Webhook לא תקינה - חייבת להיות https://" });
    }

    // webhook זמין רק בחבילה בתשלום - בדיוק כמו שדוח חלקי/מלא נגזר מהחבילה ב-scans.js.
    // אם המשתמש אינו מורשה, לא נכשלים בשקט: מחזירים שגיאה ברורה במקום לשמור הגדרה
    // שלא תעבוד בפועל (notifySiteEvent חוסם webhook לחבילה חינמית בכל מקרה).
    if (alerts_webhook_enabled && !webhookAllowed(req.user)) {
      return res.status(403).json({ error: "התראות Webhook זמינות רק בחבילות בתשלום" });
    }

    const current = await db
      .prepare("SELECT webhook_url, alerts_email_enabled, alerts_webhook_enabled FROM users WHERE id = ?")
      .get(req.user.id);

    const next = {
      webhook_url: webhook_url !== undefined ? webhook_url || null : current?.webhook_url ?? null,
      alerts_email_enabled:
        alerts_email_enabled !== undefined ? (alerts_email_enabled ? 1 : 0) : current?.alerts_email_enabled ?? 1,
      alerts_webhook_enabled:
        alerts_webhook_enabled !== undefined
          ? (alerts_webhook_enabled ? 1 : 0)
          : current?.alerts_webhook_enabled ?? 0,
    };

    await db
      .prepare(
        "UPDATE users SET webhook_url = ?, alerts_email_enabled = ?, alerts_webhook_enabled = ? WHERE id = ?"
      )
      .run(next.webhook_url, next.alerts_email_enabled, next.alerts_webhook_enabled, req.user.id);

    res.json({
      webhook_url: next.webhook_url || "",
      alerts_email_enabled: !!next.alerts_email_enabled,
      alerts_webhook_enabled: !!next.alerts_webhook_enabled,
      webhook_allowed: webhookAllowed(req.user),
    });
  })
);

module.exports = router;
