/**
 * Type-only client surface for the future FastAPI backend.
 *
 * All backend routes are served under the `/api` prefix (see API_PREFIX).
 * This package intentionally ships types only — no runtime fetch logic —
 * so the web app can build and typecheck before the M1 JSON API lands.
 */

export const API_PREFIX = "/api";

/** Summary of a tailoring job. */
export interface JobSummary {
  id: string;
  company: string;
  targetTitle: string;
  status: string;
  createdAt: string;
}

/** Summary of a generated tailoring plan for a job. */
export interface PlanSummary {
  jobId: string;
  summary: string;
  createdAt: string;
}

/** A single achievement rewrite record within a review. */
export interface RewriteRecord {
  achievementId: string;
  sourceText: string;
  rewrittenText: string;
  status: string;
  usedRewrite: boolean;
  validationPassed: boolean;
  issues: string[];
}

/** One requirement-coverage row for a job (JD requirement vs evidence). */
export interface RequirementCoverageRow {
  requirement: string;
  covered: boolean;
  evidence?: string;
}

/** Skill diff entry for a job (added / removed / kept). */
export interface SkillDiff {
  skill: string;
  category: string;
  status: "added" | "removed" | "kept";
}

/** Which LLM providers were requested vs actually used. */
export interface ProvidersInfo {
  requested: string;
  used: string;
  fallbackError?: string;
}

/** Result metadata for a rendered PDF resume. */
export interface PdfResult {
  output: string;
  pageCount: number;
  fontRequested: string;
  auditPassed: boolean;
  trimmed: boolean;
}

/** Payload submitted when a user approves/edits rewrites. */
export interface ReviewSubmit {
  rewrites: Record<string, string>;
  summary?: string;
}

/** Outcome of a review submission. */
export interface ReviewResult {
  rejected: string[];
  rewriteSummary: string;
}
