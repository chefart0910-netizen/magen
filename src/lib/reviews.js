// תוויות משותפות לחוות דעת מקצועית - משמשות גם את המסך וגם את הדוח המודפס.
export const SCORE_OPINION_LABELS = {
  accurate: "הציון משקף את מצב האתר",
  too_harsh: "הציון מחמיר ביחס למצב בפועל",
  too_lenient: "הציון מקל ביחס למצב בפועל",
};

export const SCORE_OPINION_OPTIONS = [
  { value: "", label: "לא מציין" },
  { value: "accurate", label: SCORE_OPINION_LABELS.accurate },
  { value: "too_harsh", label: SCORE_OPINION_LABELS.too_harsh },
  { value: "too_lenient", label: SCORE_OPINION_LABELS.too_lenient },
];
