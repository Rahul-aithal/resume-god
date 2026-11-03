import type {
  PlanJson,
  ProvidersInfo,
  TailorResponse,
} from "@resume-god/api-client";

type ProviderStages = TailorResponse["providers"];

interface SessionPlan {
  plan: PlanJson;
  providers?: ProviderStages;
  /** Absent on plans saved before resumes were kept alongside them. */
  resumeData?: PlanJson;
  /** Lets reviewed edits be saved with the job they came from. */
  jobId?: string;
}

interface StoredPlan extends SessionPlan {
  savedAt: string;
}

const STORAGE_KEY = "resume-god:plan";

/** In-memory holder for the plan under review (per-tab). */
let session: SessionPlan | null = load();

function load(): SessionPlan | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPlan;
    if (!stored?.plan) return null;
    return {
      plan: stored.plan,
      providers: stored.providers,
      resumeData: stored.resumeData,
      jobId: stored.jobId,
    };
  } catch {
    return null;
  }
}

export function setSessionPlan(
  plan: PlanJson,
  providers?: ProviderStages,
  extra?: { resumeData?: PlanJson; jobId?: string },
): void {
  session = {
    plan,
    providers,
    resumeData: extra?.resumeData,
    jobId: extra?.jobId,
  };
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        plan,
        providers,
        resumeData: extra?.resumeData,
        jobId: extra?.jobId,
        savedAt: new Date().toISOString(),
      } satisfies StoredPlan),
    );
  } catch {
    // Storage full/unavailable: in-memory session still works.
  }
}

export function getSessionPlan(): SessionPlan | null {
  return session;
}

export function clearSessionPlan(): void {
  session = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export type { ProvidersInfo };
