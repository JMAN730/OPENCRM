export const SCORING_FACTORS = [
  "star_rating",
  "review_count",
  "has_website",
  "lead_status",
  "call_activity",
  "business_category",
  "last_contacted",
  "appointment_booked",
] as const;

export type ScoringFactor = (typeof SCORING_FACTORS)[number];
