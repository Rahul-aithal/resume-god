import type {
  JobSummary,
  PdfResult,
  PlanSummary,
  ProvidersInfo,
  RequirementCoverageRow,
  ReviewResult,
  ReviewSubmit,
  RewriteRecord,
  SkillDiff,
} from "@resume-god/api-client";

const NOT_IMPLEMENTED = "M1 JSON API not implemented yet";

export function listJobs(): Promise<JobSummary[]> {
  throw new Error(NOT_IMPLEMENTED);
}

export function getPlan(_jobId: string): Promise<PlanSummary> {
  void _jobId;
  throw new Error(NOT_IMPLEMENTED);
}

export function listRewrites(_jobId: string): Promise<RewriteRecord[]> {
  void _jobId;
  throw new Error(NOT_IMPLEMENTED);
}

export function getCoverage(_jobId: string): Promise<RequirementCoverageRow[]> {
  void _jobId;
  throw new Error(NOT_IMPLEMENTED);
}

export function getSkillDiff(_jobId: string): Promise<SkillDiff[]> {
  void _jobId;
  throw new Error(NOT_IMPLEMENTED);
}

export function getProviders(_jobId: string): Promise<ProvidersInfo> {
  void _jobId;
  throw new Error(NOT_IMPLEMENTED);
}

export function getPdf(_jobId: string): Promise<PdfResult> {
  void _jobId;
  throw new Error(NOT_IMPLEMENTED);
}

export function submitReview(
  _jobId: string,
  _payload: ReviewSubmit,
): Promise<ReviewResult> {
  void _jobId;
  void _payload;
  throw new Error(NOT_IMPLEMENTED);
}

export type {
  JobSummary,
  PdfResult,
  PlanSummary,
  ProvidersInfo,
  RequirementCoverageRow,
  ReviewResult,
  ReviewSubmit,
  RewriteRecord,
  SkillDiff,
};
