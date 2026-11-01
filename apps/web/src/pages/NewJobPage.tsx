import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ROLE_STATUSES } from "@resume-god/api-client";
import { SelectField, toOptions } from "../components/SelectField";
import {
  Alert,
  Button,
  Card,
  Field,
  PageHeader,
  Input,
  Textarea,
} from "../components/ui";
import {
  createCompany as createCompanyApi,
  fetchCompanies,
  fetchSettings,
  createTailorJob,
} from "../lib/api";

const PROVIDER_OPTIONS = [
  { value: "auto", label: "Auto (LLM if key, else offline)" },
  { value: "openai", label: "OpenAI (GPT)" },
  { value: "gemini", label: "Gemini" },
  { value: "glm", label: "GLM" },
  { value: "deterministic", label: "Offline only" },
];

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
      return createTailorJob({
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
        title="New application"
        lede="Paste a job description. Your resume is prepared in the background, using only your reviewed graph."
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
            <Field label="Target title">
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
              placeholder="Leave empty to use the reviewed profile summary"
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
            {tailor.isPending ? "Starting…" : "Start tailoring"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
