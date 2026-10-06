import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ROLE_STATUSES } from "@resume-god/api-client";
import {
  createCompany as createCompanyApi,
  fetchCompanies,
  fetchSettings,
  postTailor,
} from "../lib/api";
import { setSessionPlan } from "../lib/session";

export default function NewJobPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: fetchCompanies,
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  const [companyId, setCompanyId] = useState<string>(
    searchParams.get("companyId") ?? "",
  );
  const [newCompanyName, setNewCompanyName] = useState("");
  const [targetTitle, setTargetTitle] = useState(
    searchParams.get("title") ?? "",
  );
  const [jobUrl, setJobUrl] = useState("");
  const [roleStatus, setRoleStatus] = useState("applied");
  const [provider, setProvider] = useState("auto");
  const [maxAchievements, setMaxAchievements] = useState("10");
  const [font, setFont] = useState("");
  const [summary, setSummary] = useState("");
  const [jdText, setJdText] = useState("");

  const [tailored, setTailored] = useState<{
    roleId: number | null;
    skillDiff: Record<string, unknown> | null;
  } | null>(null);

  const createCompany = useMutation({
    mutationFn: () => createCompanyApi({ name: newCompanyName }),
    onSuccess: (company) => {
      setCompanyId(String(company.id));
      setNewCompanyName("");
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const tailor = useMutation({
    mutationFn: () => {
      const selectedId =
        companyId === "__new__" ? undefined : Number(companyId) || undefined;
      return postTailor({
        jd_text: jdText,
        target_title: targetTitle || undefined,
        provider,
        max_achievements: Number(maxAchievements) || 10,
        font: font || settings.data?.default_font || undefined,
        summary: summary || undefined,
        company_id: selectedId,
        company_name: companyId === "__new__" ? newCompanyName : undefined,
        job_url: jobUrl || undefined,
        role_status: roleStatus,
      });
    },
    onSuccess: (data) => {
      setSessionPlan(data.plan, data.providers);
      setTailored({
        roleId: data.role_id ?? null,
        skillDiff: (data.skill_diff as Record<string, unknown>) ?? null,
      });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const canSubmit =
    !tailor.isPending &&
    jdText.trim().length > 0 &&
    (companyId === "__new__"
      ? newCompanyName.trim().length > 0
      : companyId !== "");

  const diff = tailored?.skillDiff as {
    summary?: string;
    have?: unknown[];
    inferred?: unknown[];
    missing_no_evidence?: unknown[];
    unknown_jd_terms?: unknown[];
  } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">New application</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            tailor.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Company
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select a company…
                </option>
                {(companies.data?.companies ?? []).map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.name}
                  </option>
                ))}
                <option value="__new__">+ New company…</option>
              </select>
            </label>
            {companyId === "__new__" && (
              <label className="block text-sm font-medium">
                New company name
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="e.g. Goodspace"
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  required
                />
              </label>
            )}
            <label className="block text-sm font-medium">
              Target title
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Software Engineer"
                value={targetTitle}
                onChange={(event) => setTargetTitle(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Job posting URL (optional)
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="https://…"
                value={jobUrl}
                onChange={(event) => setJobUrl(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Pipeline status
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={roleStatus}
                onChange={(event) => setRoleStatus(event.target.value)}
              >
                {ROLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Provider
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              >
                <option value="auto">Auto (LLM if key, else offline)</option>
                <option value="gemini">Gemini</option>
                <option value="glm">GLM</option>
                <option value="deterministic">Offline only</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Max bullets
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={maxAchievements}
                onChange={(event) => setMaxAchievements(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Font (default from settings:{" "}
              {settings.data?.default_font ?? "Calibri"})
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder={settings.data?.default_font ?? "Calibri"}
                value={font}
                onChange={(event) => setFont(event.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Summary override (optional)
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Leave empty to use the reviewed profile summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Job description
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              value={jdText}
              onChange={(event) => setJdText(event.target.value)}
              rows={12}
              placeholder="Paste the full job description here…"
              required
            />
          </label>
          {tailor.isError && (
            <p role="alert" className="text-sm text-rose-600">
              {String(tailor.error)}
            </p>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {tailor.isPending ? "Tailoring…" : "Generate tailored plan"}
          </button>
        </form>
      </div>

      {tailored && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="font-semibold text-emerald-800">Plan generated</h2>
          {diff?.summary && (
            <p className="mt-1 text-sm text-emerald-900">{diff.summary}</p>
          )}
          {tailored.roleId != null && (
            <p className="mt-1 text-sm text-emerald-900">
              Recorded in your tracker —{" "}
              <a href={`/roles/${tailored.roleId}`} className="underline">
                view role
              </a>
              .
            </p>
          )}
          {Array.isArray(diff?.have) && diff!.have!.length > 0 && (
            <p className="mt-1 text-sm text-emerald-900">
              You have direct evidence for {diff!.have!.length} expected
              skill(s)
              {Array.isArray(diff?.inferred) &&
                diff!.inferred!.length > 0 &&
                ` (+${diff!.inferred!.length} inferred)`}
              .
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => navigate("/review")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Review the AI plan →
            </button>
            <button
              onClick={() => {
                tailor.reset();
                setTailored(null);
              }}
              className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Tailor another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
