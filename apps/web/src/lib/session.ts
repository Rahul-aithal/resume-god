import type { PlanJson, TailorResponse } from "@resume-god/api-client";

/** In-memory holder for the plan under review (per-tab, lost on reload). */
let session: {
  plan: PlanJson;
  providers?: TailorResponse["providers"];
} | null = null;

export function setSessionPlan(
  plan: PlanJson,
  providers?: TailorResponse["providers"],
): void {
  session = { plan, providers };
}

export function getSessionPlan(): {
  plan: PlanJson;
  providers?: TailorResponse["providers"];
} | null {
  return session;
}

export function clearSessionPlan(): void {
  session = null;
}
