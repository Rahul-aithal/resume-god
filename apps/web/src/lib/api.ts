import type {
  ApiKeyStatus,
  ApplicationHistoryEntry,
  AuthProvidersInfo,
  Company,
  DeviceAccount,
  CompanyDetail,
  CompanyInput,
  DashboardSummary,
  MeInfo,
  PlanJson,
  GraphAchievement,
  GraphImportResult,
  GraphParent,
  GraphProjection,
  GraphReviewState,
  GraphSearchResponse,
  GraphSkill,
  ProvidersStatus,
  ReviewResponse,
  Role,
  RoleHistoryResponse,
  RoleInput,
  RolePatch,
  TailorResponse,
  UserSettings,
} from "@resume-god/api-client";
import { API_PREFIX } from "@resume-god/api-client";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent("resume-god:unauthorized"));
    }
    const detail = await response
      .json()
      .then((body) => {
        // Error shape: message (string or string[]), or legacy detail.
        const value = body.message ?? body.detail;
        if (typeof value === "string") return value;
        if (Array.isArray(value)) {
          return value
            .map((item) =>
              typeof item.msg === "string"
                ? item.msg
                : typeof item === "string"
                  ? item
                  : JSON.stringify(item),
            )
            .join("; ");
        }
        return response.statusText;
      })
      .catch(() => response.statusText);
    throw new ApiError(response.status, detail);
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
  company_id?: number;
  company_name?: string;
  job_url?: string;
  role_status?: string;
}

export function fetchProviders(): Promise<ProvidersStatus> {
  return request<ProvidersStatus>("/providers");
}

export function fetchMe(): Promise<MeInfo> {
  return request<MeInfo>("/auth/me");
}

export function fetchAuthProviders(): Promise<AuthProvidersInfo> {
  return request<AuthProvidersInfo>("/auth/providers");
}

export async function logout(): Promise<void> {
  await fetch(`${API_PREFIX}/auth/logout`, { method: "POST" });
}

export function fetchAccounts(): Promise<{ accounts: DeviceAccount[] }> {
  return request<{ accounts: DeviceAccount[] }>("/auth/accounts");
}

export function switchAccount(userId: string): Promise<{ status: string }> {
  return request<{ status: string }>("/auth/accounts/switch", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
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
    throw new ApiError(response.status, `API ${response.status}: ${detail}`);
  }
  return response.blob();
}

export function fetchDashboard(): Promise<DashboardSummary> {
  return request<DashboardSummary>("/dashboard");
}

export function fetchCompanies(): Promise<{ companies: Company[] }> {
  return request<{ companies: Company[] }>("/companies");
}

export function fetchCompany(id: number): Promise<CompanyDetail> {
  return request<CompanyDetail>(`/companies/${id}`);
}

export function createCompany(body: CompanyInput): Promise<Company> {
  return request<Company>("/companies", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchRoles(options?: {
  companyId?: number;
  status?: string;
}): Promise<{ roles: Role[] }> {
  const params = new URLSearchParams();
  if (options?.companyId != null)
    params.set("company_id", String(options.companyId));
  if (options?.status) params.set("status", options.status);
  const query = params.toString();
  return request<{ roles: Role[] }>(`/roles${query ? `?${query}` : ""}`);
}

export function createRole(body: RoleInput): Promise<Role> {
  return request<Role>("/roles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchRole(id: number, body: RolePatch): Promise<Role> {
  return request<Role>(`/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchRoleHistory(id: number): Promise<RoleHistoryResponse> {
  return request<RoleHistoryResponse>(`/roles/${id}/history`);
}

export function fetchSettings(): Promise<UserSettings> {
  return request<UserSettings>("/settings");
}

export function updateSettings(
  body: Partial<UserSettings>,
): Promise<UserSettings> {
  return request<UserSettings>("/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function fetchApiKeys(): Promise<{ keys: ApiKeyStatus[] }> {
  return request<{ keys: ApiKeyStatus[] }>("/settings/api-keys");
}

export function saveApiKey(
  provider: string,
  apiKey: string,
): Promise<{ keys: ApiKeyStatus[] }> {
  return request<{ keys: ApiKeyStatus[] }>(`/settings/api-keys/${provider}`, {
    method: "PUT",
    body: JSON.stringify({ api_key: apiKey }),
  });
}

export function deleteApiKey(
  provider: string,
): Promise<{ keys: ApiKeyStatus[] }> {
  return request<{ keys: ApiKeyStatus[] }>(`/settings/api-keys/${provider}`, {
    method: "DELETE",
  });
}

// ---- Knowledge graph ----

export function fetchGraph(): Promise<GraphProjection> {
  return request<GraphProjection>("/graph");
}

export function graphSearch(
  q: string,
  limit = 5,
): Promise<GraphSearchResponse> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return request<GraphSearchResponse>(`/graph/search?${params}`);
}

export function createGraphSkill(body: {
  name: string;
  category?: string;
  aliases?: string[];
}): Promise<GraphSkill> {
  return request<GraphSkill>("/graph/skills", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchGraphSkill(id: string): Promise<GraphSkill> {
  return request<GraphSkill>(`/graph/skills/${id}`);
}

export function fetchGraphAchievement(id: string): Promise<GraphAchievement> {
  return request<GraphAchievement>(`/graph/achievements/${id}`);
}

export function updateGraphSkill(
  id: string,
  body: { name?: string; category?: string; aliases?: string[] },
): Promise<GraphSkill> {
  return request<GraphSkill>(`/graph/skills/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteGraphSkill(id: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/graph/skills/${id}`, {
    method: "DELETE",
  });
}

export function createGraphParent(body: {
  kind: "experience" | "project";
  name: string;
  title?: string;
  url?: string;
  date_range?: string;
}): Promise<GraphParent> {
  return request<GraphParent>("/graph/parents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateGraphParent(
  id: string,
  body: { name?: string; title?: string; url?: string; date_range?: string },
): Promise<GraphParent> {
  return request<GraphParent>(`/graph/parents/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteGraphParent(id: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/graph/parents/${id}`, {
    method: "DELETE",
  });
}

export function createGraphAchievement(body: {
  parent_id: string;
  text: string;
  date_range?: string;
  skills?: string[];
  metrics?: string[];
}): Promise<GraphAchievement> {
  return request<GraphAchievement>("/graph/achievements", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateGraphAchievement(
  id: string,
  body: {
    parent_id?: string;
    text?: string;
    date_range?: string;
    skills?: string[];
    metrics?: string[];
  },
): Promise<GraphAchievement> {
  return request<GraphAchievement>(`/graph/achievements/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteGraphAchievement(
  id: string,
): Promise<{ status: string }> {
  return request<{ status: string }>(`/graph/achievements/${id}`, {
    method: "DELETE",
  });
}

export function reviewGraph(): Promise<GraphReviewState> {
  return request<GraphReviewState>("/graph/review", { method: "POST" });
}

export function unreviewGraph(): Promise<GraphReviewState> {
  return request<GraphReviewState>("/graph/review", { method: "DELETE" });
}

export function importGraph(body: {
  format: "yaml" | "json";
  content: string;
  mode: "replace" | "merge";
}): Promise<GraphImportResult> {
  return request<GraphImportResult>("/graph/import", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function exportGraph(
  format: "yaml" | "json",
): Promise<{ format: string; content: unknown }> {
  return request<{ format: string; content: unknown }>(
    `/graph/export?format=${format}`,
  );
}
