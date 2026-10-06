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

/** M1 JSON API shapes (plan passed by value). */

export type PlanJson = Record<string, unknown>;

export interface CoverageRow {
  Requirement?: string;
  name?: string;
  Priority?: string;
  priority?: string;
  Status?: string;
  status?: string;
  kind?: string;
}

export interface ProviderStage {
  requested: string;
  used: string;
  fallback_error?: string | null;
}

export interface TailorResponse {
  plan: PlanJson;
  skill_diff: PlanJson;
  providers: Record<string, ProviderStage> & { artifact?: string };
  role_id?: number | null;
}

export interface ReviewResponse {
  plan: PlanJson;
  rejected_edits: string[];
  resume_data: PlanJson;
  validation: {
    dropped_bullets: string[];
    fallback_bullets: string[];
    issues: string[];
  };
}

export interface ProvidersStatus {
  order: string[];
  auto: string;
  models: Record<string, string>;
  default_font?: string;
}

export interface MeInfo {
  id: number;
  email: string;
  display_name: string;
}

/** OAuth setup state reported by GET /api/auth/providers. */
export interface AuthProviderInfo {
  configured: boolean;
  login_path: string;
}

export interface AuthProvidersInfo {
  google: AuthProviderInfo;
  redirect_uri: string;
  base_url_source: "env" | "request";
}

/** B4 tracker + settings shapes. */

export const ROLE_STATUSES = [
  "wishlist",
  "applied",
  "oa",
  "interview",
  "offer",
  "rejected",
] as const;

export type RoleStatus = (typeof ROLE_STATUSES)[number];

export interface Company {
  id: number;
  name: string;
  website: string;
  location: string;
  about: string;
  notes: string;
  role_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface Role {
  id: number;
  company_id: number;
  company_name?: string;
  target_title: string;
  status: string;
  job_url: string;
  salary: string;
  location: string;
  notes: string;
  created_at: string | null;
}

export interface CompanyDetail extends Company {
  roles: Role[];
  by_status: Record<string, number>;
}

export interface CompanyInput {
  name: string;
  website?: string;
  location?: string;
  about?: string;
  notes?: string;
}

export interface RoleInput {
  company_id: number;
  target_title: string;
  status?: string;
  job_url?: string;
  salary?: string;
  location?: string;
  notes?: string;
}

export interface RolePatch {
  status?: string;
  job_url?: string;
  salary?: string;
  location?: string;
  notes?: string;
}

export interface ApplicationHistoryEntry {
  id: number;
  role_id: number;
  status: string;
  job_url: string;
  salary: string;
  location: string;
  applied_on: string;
  notes: string;
  created_at: string | null;
}

export interface RoleHistoryResponse {
  role: Role;
  history: ApplicationHistoryEntry[];
}

export interface ArtifactInfo {
  id: number;
  kind: string;
  path: string;
  created_at: string | null;
}

export interface DashboardSummary {
  company_count: number;
  role_count: number;
  by_status: Record<string, number>;
  recent_roles: Role[];
  recent_artifacts: ArtifactInfo[];
}

export interface UserSettings {
  llm_order: string;
  gemini_model: string;
  glm_model: string;
  default_font: string;
}

export interface ProfileVersion {
  version: number;
  status: string;
  is_active: boolean;
  created_at: string | null;
}

export interface ProfilesResponse {
  versions: ProfileVersion[];
  has_active: boolean;
  active_status: string | null;
}

export interface ProfileImportResponse {
  version: number;
  status: string;
  is_active: boolean;
}
