import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  buttonVariants,
  Button,
  Card,
  DotBadge,
  EmptyState,
  PageHeader,
  Textarea,
} from "../components/ui";
import { postRender, postReview } from "../lib/api";
import { getSessionPlan, setSessionPlan } from "../lib/session";

function rewritesOf(plan: Record<string, unknown>): Record<string, unknown> {
  return (plan.rewrites as Record<string, unknown> | undefined) ?? {};
}

function coverageOf(plan: Record<string, unknown>): unknown[] {
  return (plan.requirement_coverage as unknown[] | undefined) ?? [];
}

interface DiffShape {
  summary?: string;
  have?: { name?: string }[];
  inferred?: { name?: string }[];
  partial_or_not_selected?: { name?: string }[];
  missing_no_evidence?: { name?: string }[];
  unknown_jd_terms?: { name?: string }[];
}

function diffOf(plan: Record<string, unknown>): DiffShape | null {
  return (plan.skill_diff as DiffShape | undefined) ?? null;
}

export default function ReviewPage() {
  const session = getSessionPlan();
  const [plan, setPlan] = useState<Record<string, unknown> | null>(
    (session?.plan as Record<string, unknown> | undefined) ?? null,
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [rejected, setRejected] = useState<string[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  if (!plan) {
    return (
      <div className="py-6">
        <EmptyState
          title="No plan loaded"
          action={
            <Link to="/jobs/new" className={buttonVariants("primary")}>
              + New application
            </Link>
          }
        >
          Tailor a job first — the plan will wait for you here (even after a
          reload).
        </EmptyState>
        <h1 className="sr-only">Review</h1>
      </div>
    );
  }

  const rewrites = rewritesOf(plan);
  const diff = diffOf(plan);
  const stages = (session?.providers ?? {}) as Record<
    string,
    { requested?: string; used?: string; fallback_error?: string | null }
  >;
  const stageNames: Array<[string, string]> = [
    ["parsing", "Parsing"],
    ["selection", "Selection"],
    ["rewriting", "Rewriting"],
  ];

  async function submitReview() {
    setBusy(true);
    setError(null);
    try {
      const result = await postReview(
        plan as never,
        edits,
        summary || undefined,
      );
      setPlan(result.plan as Record<string, unknown>);
      setSessionPlan(result.plan, session?.providers);
      setRejected(result.rejected_edits);
      setIssues(result.validation.issues);
      setEdits({});
    } catch (error_) {
      setError(String(error_));
    } finally {
      setBusy(false);
    }
  }

  async function renderPdf() {
    setBusy(true);
    setError(null);
    try {
      const blob = await postRender(plan as never);
      const url = URL.createObjectURL(blob);
      setPdfUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    } catch (error_) {
      setError(String(error_));
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf() {
    if (!pdfUrl) return;
    const anchor = document.createElement("a");
    anchor.href = pdfUrl;
    anchor.download = "resume.pdf";
    anchor.click();
  }

  const unevidenced = diff?.missing_no_evidence ?? [];
  const unknownTerms = diff?.unknown_jd_terms ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review the AI plan"
        lede="Every bullet must trace back to your reviewed graph — edit any wording before it renders."
        actions={
          pdfUrl && (
            <Button variant="secondary" onClick={downloadPdf}>
              Download PDF
            </Button>
          )
        }
      />

      {session?.providers && (
        <div className="flex flex-wrap gap-2">
          {stageNames.map(([key, label]) => {
            const stage = stages[key];
            if (!stage) return null;
            const drifted =
              stage.requested && stage.used && stage.requested !== stage.used;
            return (
              <DotBadge
                key={key}
                color={stage.fallback_error ? "review" : "st-wishlist"}
                title={
                  stage.fallback_error
                    ? `Fallback: ${stage.fallback_error}`
                    : undefined
                }
              >
                {label}: {stage.used ?? "?"}
                {drifted ? ` (requested ${stage.requested})` : ""}
                {stage.fallback_error ? " ⚠" : ""}
              </DotBadge>
            );
          })}
        </div>
      )}

      {rejected.length > 0 && (
        <Alert role="alert" tone="review">
          Rejected edits (reverted to reviewed originals): {rejected.join(", ")}
        </Alert>
      )}
      {issues.length > 0 && (
        <Alert role="alert" tone="review">
          <ul className="list-inside list-disc">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Alert>
      )}

      {diff && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">
            Skill diff — they expect vs you have
          </h2>
          {diff.summary && (
            <p className="mt-1 text-sm text-ink-2">{diff.summary}</p>
          )}
          <div className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <SkillList
              title={`Direct evidence (${diff.have?.length ?? 0})`}
              skills={diff.have}
              color="ok"
            />
            <SkillList
              title={`Inferred (${diff.inferred?.length ?? 0})`}
              skills={diff.inferred}
              color="st-applied"
            />
            <SkillList
              title={`Missing — no evidence (${unevidenced.length})`}
              skills={unevidenced}
              color="danger"
            />
            <SkillList
              title={`Unknown JD terms (${unknownTerms.length})`}
              skills={unknownTerms}
              color="st-wishlist"
            />
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {Object.entries(rewrites).map(([id, record]) => {
          const entry = record as {
            source_text: string;
            rewritten_text: string;
            used_rewrite: boolean;
            status: string;
          };
          return (
            <Card key={id} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono text-xs text-ink-2">{id}</h3>
                <DotBadge color={entry.used_rewrite ? "brand" : "st-wishlist"}>
                  {entry.used_rewrite ? "AI rewrite used" : "original"} (
                  {entry.status})
                </DotBadge>
              </div>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-ink-2">
                    Reviewed source
                  </p>
                  <p className="mt-1.5 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-ink">
                    {entry.source_text}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-2">
                    AI wording (edit to override)
                    <Textarea
                      className="mt-1.5 p-3 leading-relaxed"
                      rows={3}
                      defaultValue={entry.rewritten_text}
                      onChange={(event) =>
                        setEdits((previous) => ({
                          ...previous,
                          [id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Coverage</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {coverageOf(plan).map((row, index) => {
            const item = row as Record<string, string>;
            const status = String(item.Status ?? item.status ?? "");
            const covered =
              status.includes("covered") ||
              status === "yes" ||
              status === "direct";
            return (
              <li
                key={String(item.id ?? item.Requirement ?? item.name ?? index)}
                className="flex items-start gap-2"
              >
                <DotBadge color={covered ? "ok" : "danger"}>
                  {status || "?"}
                </DotBadge>
                <span className="text-ink">
                  {String(
                    item.Requirement ?? item.name ?? JSON.stringify(item),
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-5">
        <label className="block text-sm font-medium text-ink">
          Summary override (optional, applies to review + render)
          <Textarea
            className="mt-1.5"
            rows={2}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Leave empty to keep the reviewed profile summary"
          />
        </label>
      </Card>

      {error && <Alert role="alert">{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={busy}
          loading={busy}
          onClick={submitReview}
        >
          {busy ? "Working…" : "Validate my edits"}
        </Button>
        <Button disabled={busy} loading={busy} onClick={renderPdf}>
          {busy ? "Rendering…" : "Render PDF"}
        </Button>
      </div>

      {pdfUrl && (
        <Card className="overflow-hidden p-5">
          <h2 className="text-sm font-semibold">Rendered resume</h2>
          <iframe
            title="Rendered resume PDF"
            src={pdfUrl}
            className="mt-3 h-[700px] w-full rounded-lg border border-line"
          />
        </Card>
      )}
    </div>
  );
}

function SkillList({
  title,
  skills,
  color,
}: {
  title: string;
  skills?: { name?: string }[];
  color: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold" style={{ color: `var(--${color})` }}>
        {title}
      </p>
      <p className="mt-1 text-ink-2">
        {(skills ?? [])
          .map((skill) => skill.name)
          .filter(Boolean)
          .join(", ") || "—"}
      </p>
    </div>
  );
}
