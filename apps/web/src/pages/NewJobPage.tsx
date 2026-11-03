import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ROLE_STATUSES, type TailorJobDetail } from "@resume-god/api-client";
import { SelectField, toOptions } from "../components/SelectField";
import {
  Alert,
  Button,
  Card,
  Field,
  PageHeader,
  Input,
  Skeleton,
  Textarea,
} from "../components/ui";
import {
  createCompany as createCompanyApi,
  fetchCompanies,
  fetchSettings,
  fetchTailorJob,
  createTailorJob,
  retryTailorJob,
} from "../lib/api";

const PROVIDER_OPTIONS = [
  { value: "auto", label: "Auto (LLM if key, else offline)" },
  { value: "openai", label: "OpenAI (GPT)" },
  { value: "gemini", label: "Gemini" },
  { value: "glm", label: "GLM" },
  { value: "deterministic", label: "Offline only" },
];

/** With ?retry=<job id>, the form opens on that failed job's input. */
export default function NewJobPage() {
  const [searchParams] = useSearchParams();
  const retryId = searchParams.get("retry");
  const job = useQuery({
    queryKey: ["tailor-job", retryId],
    queryFn: () => fetchTailorJob(retryId as string),
    enabled: retryId !== null,
    gcTime: 0,
  });
  if (retryId === null) return <JobForm />;
  if (job.isPending) return <Skeleton className="h-96 rounded-lg" />;
  if (job.isError) {
    return (
      <Alert role="alert" title="Could not load this job">
        {job.error.message}
      </Alert>
    );
  }
  return <JobForm key={job.data.id} failed={job.data} />;
}

function JobForm({ failed }: { failed?: TailorJobDetail }) {
  const previous = failed?.request;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: fetchCompanies,
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  const [companyId, setCompanyId] = useState<string>(() => {
    if (previous?.company_id != null) return String(previous.company_id);
    if (previous?.company_name) return "__new__";
    return searchParams.get("companyId") ?? "";
  });
  const [newCompanyName, setNewCompanyName] = useState(
    previous?.company_name ?? "",
  );
  const [targetTitle, setTargetTitle] = useState(
    previous?.target_title ?? searchParams.get("title") ?? "",
  );
  const [jobUrl, setJobUrl] = useState(previous?.job_url ?? "");
  const [roleStatus, setRoleStatus] = useState(
    previous?.role_status ?? "applied",
  );
  const [provider, setProvider] = useState(previous?.provider ?? "auto");
  const [maxAchievements, setMaxAchievements] = useState(
    String(previous?.max_achievements ?? 14),
  );
  const [font, setFont] = useState(previous?.font ?? "");
  const [summary, setSummary] = useState(previous?.summary ?? "");
  const [jdText, setJdText] = useState(previous?.jd_text ?? "");

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
      const input = {
        jd_text: jdText,
        target_title: targetTitle || undefined,
        provider,
        max_achievements: Number(maxAchievements) || 14,
        font: font || settings.data?.default_font || undefined,
        summary: summary || undefined,
        company_id: selectedId,
        company_name: companyId === "__new__" ? newCompanyName : undefined,
        job_url: jobUrl || undefined,
        role_status: roleStatus,
      };
      return failed ? retryTailorJob(failed.id, input) : createTailorJob(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tailor-jobs"] });
      navigate("/tailoring");
    },
  });

  const canSubmit =
    !tailor.isPending &&
    jdText.trim().length > 0 &&
    (companyId === "__new__"
      ? newCompanyName.trim().length > 0
      : companyId !== "");

  return (
    <div className="space-y-6">
      <PageHeader
        title={failed ? "Edit and retry" : "New application"}
        lede={
          failed
            ? "Change anything below, then run this job again."
            : "Paste a job description. Your resume is prepared in the background, using only your graph."
        }
      />

      {failed?.error && (
        <Alert role="alert" tone="review" title="The last attempt failed">
          {failed.error}
        </Alert>
      )}

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
              <SelectField
                value={companyId}
                onValueChange={setCompanyId}
                placeholder="Select a company…"
                required
                options={[
                  ...(companies.data?.companies ?? []).map((company) => ({
                    value: String(company.id),
                    label: company.name,
                  })),
                  { value: "__new__", label: "+ New company…" },
                ]}
              />
            </Field>
            {companyId === "__new__" && (
              <Field label="New company name">
                <Input
                  placeholder="e.g. Goodspace"
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  required
                />
              </Field>
            )}
            <Field
              label="Target title"
              hint="Leave empty to use the title in the posting."
            >
              <Input
                placeholder="Software Engineer"
                value={targetTitle}
                onChange={(event) => setTargetTitle(event.target.value)}
              />
            </Field>
            <Field label="Job posting URL (optional)">
              <Input
                placeholder="https://…"
                value={jobUrl}
                onChange={(event) => setJobUrl(event.target.value)}
              />
            </Field>
            <Field label="Pipeline status">
              <SelectField
                value={roleStatus}
                onValueChange={setRoleStatus}
                options={toOptions(ROLE_STATUSES)}
              />
            </Field>
            <Field label="Provider">
              <SelectField
                value={provider}
                onValueChange={setProvider}
                options={PROVIDER_OPTIONS}
              />
            </Field>
            <Field label="Max bullets">
              <Input
                value={maxAchievements}
                onChange={(event) => setMaxAchievements(event.target.value)}
              />
            </Field>
            <Field
              label="Font"
              hint={`Default from settings: ${settings.data?.default_font ?? "Calibri"}`}
            >
              <Input
                placeholder={settings.data?.default_font ?? "Calibri"}
                value={font}
                onChange={(event) => setFont(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Summary override (optional)">
            <Input
              placeholder="Leave empty to generate one"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </Field>
          <Field label="Job description">
            <Textarea
              className="font-mono text-[13px] leading-relaxed"
              value={jdText}
              onChange={(event) => setJdText(event.target.value)}
              rows={12}
              placeholder="Paste the full job description here…"
              required
            />
          </Field>
          {tailor.isError && (
            <Alert role="alert" title="Could not start tailoring">
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
            {tailor.isPending
              ? "Starting…"
              : failed
                ? "Retry tailoring"
                : "Start tailoring"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
