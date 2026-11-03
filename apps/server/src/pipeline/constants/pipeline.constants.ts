// ---- versions, recorded in generated plans ----

export const JD_PARSE_VERSION = 1;
export const REWRITE_POLICY_VERSION = 2;
export const SELECTION_POLICY_VERSION = 4;
export const RESUME_DATA_VERSION = 1;
export const PLAN_VERSION = 2;

export const DEFAULT_FONT = "Calibri";

// ---- achievement scoring ----

export const SCORE_WEIGHTS = {
  mustHaveSkill: 12,
  niceToHaveSkill: 7,
  expandedSkill: 3,
  inferredSkill: 1,
  semanticSimilarity: 8,
  recency: 4,
  /** One point per metric, up to this many. */
  maxMetricPoints: 2,
} as const;

/** Below this, an achievement with no skill match isn't relevant. */
export const MIN_SEMANTIC_SIMILARITY = 0.08;

export const RECENCY = {
  /** No usable date. */
  unknown: 0.3,
  ongoing: 1.0,
  /** Checked newest first. */
  byYear: [
    { fromYear: 2026, score: 1.0 },
    { fromYear: 2025, score: 0.8 },
    { fromYear: 2024, score: 0.65 },
  ],
  older: 0.4,
} as const;

// ---- achievement selection ----

export const COVERAGE_WEIGHTS = {
  newDirectSkill: 1000,
} as const;

export const DEFAULT_MAX_ACHIEVEMENTS = 14;
/** One line per entry reads like a description, so entries get several. */
export const EXPERIENCE_TARGET_BULLETS = 3;
export const PROJECT_TARGET_BULLETS = 2;
/** Past this, a project must evidence a skill nothing else does. */
export const MAX_PROJECTS = 4;
export const GRAPH_EXPANSION_HOPS = 2;
export const SEMANTIC_TOP_MATCHES = 5;

// ---- job description parsing ----

export const JD_ROLE_TITLE_MAX_LENGTH = 80;
export const JD_RESPONSIBILITY_MIN_LENGTH = 15;
export const JD_MAX_RESPONSIBILITIES = 12;
export const JD_MAX_KEYWORDS = 20;

// ---- rewriting and resume data ----

/** A rewrite this much longer than its source is probably keyword stuffing. */
export const REWRITE_MAX_EXTRA_CHARS = 160;
export const SUMMARY_MAX_FEATURED_SKILLS = 8;
export const SUMMARY_MAX_NAMED_PROJECTS = 2;
/** A source holding several facts may become this many bullets. */
export const REWRITE_MAX_BULLETS_PER_SOURCE = 2;

/** Read as digits, so "four stages" and "4 stages" are the same claim. */
export const NUMBER_WORDS: Record<string, string> = {
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};
/** Vague amounts are still claims about scale. */
export const AMOUNT_WORDS =
  /\b(?:dozens|hundreds|thousands|millions|billions)\b/gi;
