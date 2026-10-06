import type {
  PlanJson,
  ProvidersInfo,
  TailorResponse,
} from "@resume-god/api-client";

type ProviderStages = TailorResponse["providers"];

interface StoredPlan {
  plan: PlanJson;
  providers?: ProviderStages;
  savedAt: string;
}

const STORAGE_KEY = "resume-god:plan";

/** In-memory holder for the plan under review (per-tab). */
let session: { plan: PlanJson; providers?: ProviderStages } | null = load();

function load(): { plan: PlanJson; providers?: ProviderStages } | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPlan;
    if (!stored?.plan) return null;
    return { plan: stored.plan, providers: stored.providers };
  } catch {
    return null;
  }
}

export function setSessionPlan(
  plan: PlanJson,
  providers?: ProviderStages,
  roleInfo?: { roleId?: number | null; company?: string; title?: string },
): void {
  session = { plan, providers };
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        plan,
        providers,
        savedAt: new Date().toISOString(),
        ...roleInfo,
      } satisfies StoredPlan),
    );
  } catch {
    // Storage full/unavailable: in-memory session still works.
  }
}

export function getSessionPlan(): {
  plan: PlanJson;
  providers?: ProviderStages;
} | null {
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
