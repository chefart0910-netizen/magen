import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useLang } from "../lib/LangContext";

// MAGEN - הגדרות התראות מעקב: webhook (כולל Slack/Discord Incoming Webhook) + הפעלה/
// כיבוי מייל ו-webhook. webhook זמין רק בחבילה בתשלום (ראו lib/services/alerts.js +
// lib/routes/account.js) - אותו שער שמחליט דוח חלקי/מלא ב-scans.js.

const T = {
  he: {
    title: "הגדרות התראות",
    sub: "MAGEN בודק את האתרים שלכם ברקע (זמינות ותוקף SSL) ושולח התראה כששינוי אמיתי קורה - נפילה, חזרה לפעולה, או תעודה שעומדת לפוג.",
    emailLabel: "התראות במייל",
    emailHint: "יישלח לכתובת המייל של החשבון",
    webhookLabel: "התראות Webhook",
    webhookHint: "זמין בחבילות בתשלום - תואם Slack/Discord Incoming Webhook",
    webhookUpgrade: "שדרגו חבילה כדי להפעיל התראות Webhook.",
    webhookUrlLabel: "כתובת Webhook",
    webhookUrlPlaceholder: "https://hooks.slack.com/services/...",
    webhookUrlHint:
      "מדביקים כאן את כתובת ה-Incoming Webhook מ-Slack או מ-Discord - שתיהן מקבלות את אותו פורמט POST ישירות, בלי הגדרה נוספת.",
    save: "שמירה",
    saving: "שומר...",
    saved: "ההגדרות נשמרו.",
    loading: "טוען...",
  },
  en: {
    title: "Alert settings",
    sub: "MAGEN checks your sites in the background (uptime and SSL expiry) and alerts you only on a real change - down, back up, or a certificate about to expire.",
    emailLabel: "Email alerts",
    emailHint: "Sent to the account's email address",
    webhookLabel: "Webhook alerts",
    webhookHint: "Available on paid plans - compatible with Slack/Discord Incoming Webhooks",
    webhookUpgrade: "Upgrade your plan to enable Webhook alerts.",
    webhookUrlLabel: "Webhook URL",
    webhookUrlPlaceholder: "https://hooks.slack.com/services/...",
    webhookUrlHint:
      "Paste a Slack or Discord Incoming Webhook URL here - both accept the same POST body directly, no extra setup.",
    save: "Save",
    saving: "Saving...",
    saved: "Settings saved.",
    loading: "Loading...",
  },
};

export default function Settings() {
  const { lang } = useLang();
  const { user } = useAuth();
  const t = T[lang] || T.he;

  const [loaded, setLoaded] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookAllowed, setWebhookAllowed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getAlertSettings()
      .then((data) => {
        setWebhookUrl(data.webhook_url || "");
        setEmailEnabled(!!data.alerts_email_enabled);
        setWebhookEnabled(!!data.alerts_webhook_enabled);
        setWebhookAllowed(!!data.webhook_allowed);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoaded(true));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const data = await api.saveAlertSettings({
        webhook_url: webhookUrl,
        alerts_email_enabled: emailEnabled,
        alerts_webhook_enabled: webhookEnabled,
      });
      setWebhookUrl(data.webhook_url || "");
      setEmailEnabled(!!data.alerts_email_enabled);
      setWebhookEnabled(!!data.alerts_webhook_enabled);
      setWebhookAllowed(!!data.webhook_allowed);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <div className="text-dim">{t.loading}</div>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t.title}</h1>
          <div className="sub">{t.sub}</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card vo" style={{ maxWidth: 520 }}>
        <form onSubmit={save}>
          <div className="form-field">
            <label className="choice">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
              />
              <span>
                <strong>{t.emailLabel}</strong>
                <span className="choice-hint">{t.emailHint}</span>
              </span>
            </label>
          </div>

          <div className="form-field">
            <label className="choice">
              <input
                type="checkbox"
                checked={webhookEnabled}
                disabled={!webhookAllowed}
                onChange={(e) => setWebhookEnabled(e.target.checked)}
              />
              <span>
                <strong>{t.webhookLabel}</strong>
                <span className="choice-hint">{t.webhookHint}</span>
              </span>
            </label>
            {!webhookAllowed && (
              <div className="text-dim" style={{ marginTop: 4 }}>
                {t.webhookUpgrade}
              </div>
            )}
          </div>

          <div className="form-field">
            <label className="label" htmlFor="webhook-url">
              {t.webhookUrlLabel}
            </label>
            <input
              id="webhook-url"
              className="input"
              type="url"
              placeholder={t.webhookUrlPlaceholder}
              value={webhookUrl}
              disabled={!webhookAllowed}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <div className="text-dim" style={{ marginTop: 4, fontSize: 13 }}>
              {t.webhookUrlHint}
            </div>
          </div>

          {saved && <div className="success-banner">{t.saved}</div>}

          <button className="btn btn-primary" disabled={saving}>
            {saving ? t.saving : t.save}
          </button>
        </form>
      </div>
    </>
  );
}
