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

export type TailorJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface TailorJob {
  id: string;
  status: TailorJobStatus;
  stage: string | null;
  target_title: string;
  company: string;
  role_id: number | null;
  error: string | null;
  warning: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface TailorJobDetail extends TailorJob {
  result: {
    plan: PlanJson;
    resume_data: PlanJson;
    validation: {
      dropped_bullets: string[];
      fallback_bullets: string[];
      issues: string[];
    };
    providers: TailorResponse["providers"];
  } | null;
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
  /** Better Auth user id (text) since the NestJS migration. */
  id: string;
  email: string;
  display_name: string;
}

/** An account signed in on this browser. */
export interface DeviceAccount {
  id: string;
  email: string;
  display_name: string;
  active: boolean;
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
  openai_model: string;
  default_font: string;
}

export interface ApiKeyStatus {
  provider: string;
  /** Which key a run would use. A user's own key beats the server's. */
  source: "user" | "server" | "none";
  last4: string | null;
  needs_reentry: boolean;
}

// ---- Knowledge graph (normalized; files are transport only) ----

export type GraphNodeKind =
  | "skill"
  | "experience"
  | "project"
  | "achievement"
  | "education"
  | "certification";

export type GraphEdgeType = "USES" | "PART_OF" | "DEMONSTRATES" | "IMPLIES";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  detail: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: GraphEdgeType;
}

export interface GraphProjection {
  reviewed_at: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    skills: number;
    parents: number;
    achievements: number;
    education: number;
    certifications: number;
    edges: number;
  };
}

export interface GraphSkill {
  id: string;
  name: string;
  category: string;
  aliases: string[];
}

export interface GraphParent {
  id: string;
  kind: "experience" | "project";
  name: string;
  title: string;
  url: string;
  date_range: string;
  skills: string[];
}

export interface GraphAchievement {
  id: string;
  parent_id: string;
  text: string;
  date_range: string;
  skills: string[];
  metrics: string[];
}

export interface GraphEducation {
  id: string;
  institution: string;
  credential: string;
  date_range: string;
}

export interface GraphCertification {
  id: string;
  name: string;
  issuer: string;
  issued_on: string;
}

export interface GraphSearchResult {
  id: string;
  text: string;
  parent_name: string;
  skills: string[];
  similarity: number;
}

export interface GraphSearchResponse {
  results: GraphSearchResult[];
}

export interface GraphImportResult {
  imported: {
    skills: number;
    parents: number;
    achievements: number;
    education: number;
    certifications: number;
    implies: number;
  };
}

export interface GraphReviewState {
  reviewed: boolean;
  reviewed_at: string | null;
}
