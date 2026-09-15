// MAGEN - חוות דעת מקצועית על סריקה.
// ==========================================================================================
// הרכיב מציג את חוות הדעת שניתנו על סריקה מסוימת, ולמי שמסומן כמומחה גם טופס לכתיבה או
// לעריכה. ההרשאה נשאלת מהשרת (api.reviewerStatus / can_review בתשובה) ולא נלקחת מהמשתמש
// השמור ב-localStorage: משתמש שסומן כמומחה אחרי שהתחבר היה צריך אחרת להתנתק ולהתחבר מחדש
// כדי לראות את הטופס.

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { SCORE_OPINION_LABELS, SCORE_OPINION_OPTIONS } from "../lib/reviews";

const EMPTY_FORM = { summary: "", improvements: "", expert_name: "", expert_title: "", score_opinion: "" };

export function ReviewCard({ review, onDelete, canDelete }) {
  return (
    <div className="review-card">
      <div className="review-head">
        <strong>{review.expert_name || "מומחה"}</strong>
        {review.status === "pending" && <span className="pending-pill">ממתין לאישור</span>}
        {review.expert_title && <span className="text-dim"> · {review.expert_title}</span>}
        {canDelete && (
          <button className="btn btn-secondary btn-sm review-delete" onClick={() => onDelete(review.id)}>
            מחק
          </button>
        )}
      </div>
      <div className="text-dim" style={{ fontSize: 12 }}>
        {formatDate(review.created_at)}
        {review.updated_at ? ` · עודכן ${formatDate(review.updated_at)}` : ""}
      </div>
      {review.score_opinion && (
        <div className="review-opinion">{SCORE_OPINION_LABELS[review.score_opinion]}</div>
      )}
      <p className="review-body">{review.summary}</p>
      {review.improvements && (
        <div className="review-improvements">
          <div className="review-improvements-title">מה אפשר להוסיף או לשפר</div>
          <p>{review.improvements}</p>
        </div>
      )}
    </div>
  );
}

export default function ExpertReview({ scanId, scanStatus }) {
  const [reviews, setReviews] = useState([]);
  const [canReview, setCanReview] = useState(false);
  const [probation, setProbation] = useState(false);
  const [myUserId, setMyUserId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!scanId) return;
    try {
      const data = await api.getScanReviews(scanId);
      setReviews(data.reviews);
      setCanReview(data.can_review);
      setProbation(!!data.probation);
      setMyUserId(data.my_user_id);
      // מומחה שכבר כתב - הטופס נטען עם דבריו, כדי שעריכה תהיה עריכה ולא כתיבה מחדש.
      const mine = data.reviews.find((r) => r.expert_user_id === data.my_user_id);
      if (mine) {
        setForm({
          summary: mine.summary || "",
          improvements: mine.improvements || "",
          expert_name: mine.expert_name || "",
          expert_title: mine.expert_title || "",
          score_opinion: mine.score_opinion || "",
        });
      } else {
        // בלי האיפוס הזה, מומחה שכתב חוות דעת על סריקה אחת ופתח סריקה אחרת מצא את
        // הטקסט הקודם ממתין בטופס - ושמירה אחת לא-קשובה מפרסמת חוות דעת שגויה בדוח
        // של לקוח אחר.
        setForm(EMPTY_FORM);
      }
    } catch (err) {
      // 403 אינו תקלה: משתמש שאינו בעל האתר ואינו מומחה פשוט לא רואה את המקטע. כל
      // שגיאה אחרת כן צריכה להיראות, אחרת המקטע נעלם בשקט.
      const message = String(err?.message || "");
      const isForbidden = /הרשאה|403/.test(message);
      setError(isForbidden ? "" : message);
    }
  }, [scanId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api.saveScanReview(scanId, form);
      setReviews(data.reviews);
      setProbation(!!data.probation);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (reviewId) => {
    setBusy(true);
    setError("");
    try {
      const data = await api.deleteReview(reviewId);
      setReviews(data.reviews);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const mine = reviews.find((r) => r.expert_user_id === myUserId);
  if (!canReview && reviews.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>חוות דעת מקצועית</h2>

      {reviews.length === 0 ? (
        <div className="text-dim">עדיין לא ניתנה חוות דעת על בדיקה זו.</div>
      ) : (
        reviews.map((r) => (
          <ReviewCard
            key={r.id}
            review={r}
            canDelete={r.expert_user_id === myUserId}
            onDelete={remove}
          />
        ))
      )}

      {error && <div className="error-banner">{error}</div>}

      {canReview && probation && (
        <div className="info-banner">
          חוות הדעת הראשונות שלכם נקראות לפני שהן מגיעות ללקוח. אחרי שלוש חוות דעת מאושרות
          הפרסום יהיה מיידי.
        </div>
      )}

      {canReview && scanStatus === "completed" && !open && (
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
          {mine ? "עריכת חוות הדעת שלי" : "כתיבת חוות דעת"}
        </button>
      )}

      {canReview && scanStatus !== "completed" && (
        <div className="text-dim" style={{ marginTop: 12 }}>
          אפשר לחוות דעה רק על בדיקה שהושלמה.
        </div>
      )}

      {open && (
        <form className="review-form" onSubmit={submit}>
          <label>
            שם המומחה (כפי שיופיע בדוח ללקוח)
            <input
              value={form.expert_name}
              onChange={(e) => setForm({ ...form, expert_name: e.target.value })}
              placeholder="ריק = השם מהחשבון"
              maxLength={120}
            />
          </label>
          <label>
            תפקיד / תחום התמחות
            <input
              value={form.expert_title}
              onChange={(e) => setForm({ ...form, expert_title: e.target.value })}
              placeholder="למשל: מומחה נגישות דיגיטלית"
              maxLength={120}
            />
          </label>
          <label>
            חוות דעת על הציון האוטומטי
            <select
              value={form.score_opinion}
              onChange={(e) => setForm({ ...form, score_opinion: e.target.value })}
            >
              {SCORE_OPINION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            חוות הדעת על האתר ועל התוצאה שהתקבלה
            <textarea
              rows={5}
              required
              minLength={10}
              maxLength={4000}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="מה באמת מצב האתר מעבר למספרים, ומה המשמעות שלו עבור בעל האתר"
            />
          </label>
          <label>
            מה אפשר להוסיף או לשפר
            <textarea
              rows={5}
              maxLength={8000}
              value={form.improvements}
              onChange={(e) => setForm({ ...form, improvements: e.target.value })}
              placeholder="המלצות מעשיות, לפי סדר עדיפות"
            />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy && <span className="spinner" />} שמירה
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
              ביטול
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
