import type {
  ApplicationHistoryEntry,
  Company,
  CompanyDetail,
  CompanyInput,
  DashboardSummary,
  MeInfo,
  PlanJson,
  ProfileImportResponse,
  ProfilesResponse,
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
        const value = body.detail;
        if (typeof value === "string") return value;
        if (Array.isArray(value)) {
          return value
            .map((item) =>
              typeof item.msg === "string" ? item.msg : JSON.stringify(item),
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

export async function logout(): Promise<void> {
  await fetch(`${API_PREFIX}/auth/logout`, { method: "POST" });
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

export function fetchProfiles(): Promise<ProfilesResponse> {
  return request<ProfilesResponse>("/profiles");
}

export function importProfile(
  profileYaml: string,
): Promise<ProfileImportResponse> {
  return request<ProfileImportResponse>("/profiles/import", {
    method: "POST",
    body: JSON.stringify({ profile_yaml: profileYaml }),
  });
}
