import type {
  MeInfo,
  PlanJson,
  ProvidersStatus,
  ReviewResponse,
  TailorResponse,
} from "@resume-god/api-client";
import { API_PREFIX } from "@resume-god/api-client";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body.detail ?? response.statusText)
      .catch(() => response.statusText);
    throw new Error(`API ${response.status}: ${detail}`);
  }
  return response.json() as Promise<T>;
}

export interface TailorInput {
  jd_text: string;
  target_title?: string;
  provider?: string;
  max_achievements?: number;
  summary?: string;
  font?: string;
}

export function fetchProviders(): Promise<ProvidersStatus> {
  return request<ProvidersStatus>("/providers");
}

export function fetchMe(): Promise<MeInfo> {
  return request<MeInfo>("/auth/me");
}

export function postTailor(input: TailorInput): Promise<TailorResponse> {
  return request<TailorResponse>("/tailor", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function postReview(
  plan: PlanJson,
  rewrittenText: Record<string, string>,
  summary?: string,
): Promise<ReviewResponse> {
  return request<ReviewResponse>("/review", {
    method: "POST",
    body: JSON.stringify({
      plan,
      edits: { rewritten_text: rewrittenText, summary: summary ?? null },
    }),
  });
}

export async function postRender(plan: PlanJson): Promise<Blob> {
  const response = await fetch(`${API_PREFIX}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body.detail ?? response.statusText)
      .catch(() => response.statusText);
    throw new Error(`API ${response.status}: ${detail}`);
  }
  return response.blob();
}
