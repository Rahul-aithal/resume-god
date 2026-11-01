import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ROLE_STATUSES } from "@resume-god/api-client";
import {
  Alert,
  Button,
  Card,
  Field,
  PageHeader,
  controlCls,
} from "../components/ui";
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
    <div className="space-y-6">
      <PageHeader
        title="New application"
        lede="Paste a job description; the plan is built only from your reviewed graph."
      />

      <Card className="p-6">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            tailor.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company">
              <select
                className={controlCls}
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
            </Field>
            {companyId === "__new__" && (
              <Field label="New company name">
                <input
                  className={controlCls}
                  placeholder="e.g. Goodspace"
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  required
                />
              </Field>
            )}
            <Field label="Target title">
              <input
                className={controlCls}
                placeholder="Software Engineer"
                value={targetTitle}
                onChange={(event) => setTargetTitle(event.target.value)}
              />
            </Field>
            <Field label="Job posting URL (optional)">
              <input
                className={controlCls}
                placeholder="https://…"
                value={jobUrl}
                onChange={(event) => setJobUrl(event.target.value)}
              />
            </Field>
            <Field label="Pipeline status">
              <select
                className={controlCls}
                value={roleStatus}
                onChange={(event) => setRoleStatus(event.target.value)}
              >
                {ROLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Provider">
              <select
                className={controlCls}
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              >
                <option value="auto">Auto (LLM if key, else offline)</option>
                <option value="openai">OpenAI (GPT)</option>
                <option value="gemini">Gemini</option>
                <option value="glm">GLM</option>
                <option value="deterministic">Offline only</option>
              </select>
            </Field>
            <Field label="Max bullets">
              <input
                className={controlCls}
                value={maxAchievements}
                onChange={(event) => setMaxAchievements(event.target.value)}
              />
            </Field>
            <Field
              label="Font"
              hint={`Default from settings: ${settings.data?.default_font ?? "Calibri"}`}
            >
              <input
                className={controlCls}
                placeholder={settings.data?.default_font ?? "Calibri"}
                value={font}
                onChange={(event) => setFont(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Summary override (optional)">
            <input
              className={controlCls}
              placeholder="Leave empty to use the reviewed profile summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </Field>
          <Field label="Job description">
            <textarea
              className={`${controlCls} font-mono text-[13px] leading-relaxed`}
              value={jdText}
              onChange={(event) => setJdText(event.target.value)}
              rows={12}
              placeholder="Paste the full job description here…"
              required
            />
          </Field>
          {tailor.isError && (
            <Alert role="alert" title="Could not generate the plan">
              {tailor.error instanceof Error
                ? tailor.error.message
                : String(tailor.error)}
            </Alert>
          )}
          <Button
            type="submit"
            loading={tailor.isPending}
            disabled={!canSubmit}
          >
            {tailor.isPending ? "Tailoring…" : "Generate tailored plan"}
          </Button>
        </form>
      </Card>

      {tailored && (
        <Card className="border-ok/40 p-6">
          <h2 className="font-semibold text-ok">Plan generated</h2>
          {diff?.summary && (
            <p className="mt-1 text-sm text-ink-2">{diff.summary}</p>
          )}
          {tailored.roleId != null && (
            <p className="mt-1 text-sm text-ink-2">
              Recorded in your tracker —{" "}
              <a
                href={`/roles/${tailored.roleId}`}
                className="text-accent underline"
              >
                view role
              </a>
              .
            </p>
          )}
          {Array.isArray(diff?.have) && diff!.have!.length > 0 && (
            <p className="mt-1 text-sm text-ink-2">
              You have direct evidence for {diff!.have!.length} expected
              skill(s)
              {Array.isArray(diff?.inferred) &&
                diff!.inferred!.length > 0 &&
                ` (+${diff!.inferred!.length} inferred)`}
              .
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button onClick={() => navigate("/review")}>
              Review the AI plan →
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                tailor.reset();
                setTailored(null);
              }}
            >
              Tailor another
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
