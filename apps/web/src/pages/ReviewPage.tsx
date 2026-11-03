import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SpinnerIcon } from "../components/icons";
import {
  Alert,
  buttonVariants,
  Button,
  Card,
  DotBadge,
  EmptyState,
  Input,
  PageHeader,
  Textarea,
} from "../components/ui";
import {
  fetchGraphAchievement,
  postRender,
  postRenderDocx,
  postReview,
  updateGraphAchievement,
} from "../lib/api";
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

interface RewriteEntry {
  source_text: string;
  rewritten_text: string;
  used_rewrite: boolean;
  status: string;
  issues?: string[];
}

/** One action at a time: only the button that was pressed shows progress. */
type Action = "check" | "build" | "word" | null;

const hasDigit = (text: string) => /\d/.test(text);

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function resumeFilename(
  resumeData: Record<string, unknown> | undefined,
  extension: string,
) {
  const contact = resumeData?.contact as { name?: string } | undefined;
  const parts = [contact?.name, resumeData?.target_title, "Resume"];
  const name = parts
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return `${name}.${extension}`;
}

export default function ReviewPage() {
  const session = getSessionPlan();
  const [plan, setPlan] = useState<Record<string, unknown> | null>(
    (session?.plan as Record<string, unknown> | undefined) ?? null,
  );
  const [resumeData, setResumeData] = useState<
    Record<string, unknown> | undefined
  >(session?.resumeData as Record<string, unknown> | undefined);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // The bullet boxes are uncontrolled; a new key shows what the server kept.
  const [revision, setRevision] = useState(0);
  const savedSummary =
    typeof resumeData?.summary === "string" ? resumeData.summary : "";
  const [summary, setSummary] = useState(savedSummary);
  const [rejected, setRejected] = useState<string[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [action, setAction] = useState<Action>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ url: string; resume: unknown } | null>(null);
  const started = useRef(false);

  const pending =
    !resumeData || summary !== savedSummary || Object.keys(edits).length > 0;
  const busy = action !== null;
  const stale = pdf !== null && (pending || pdf.resume !== resumeData);

  /** Validates pending edits and returns the resume they produce. */
  async function validateEdits(
    current: Record<string, string> = edits,
  ): Promise<Record<string, unknown>> {
    const result = await postReview(
      plan as never,
      // Stray whitespace from pasting shouldn't get an edit rejected.
      Object.fromEntries(
        Object.entries(current).map(([id, text]) => [id, text.trim()]),
      ),
      summary || savedSummary || undefined,
      typeof resumeData?.font === "string" ? resumeData.font : undefined,
      session?.jobId,
    );
    setPlan(result.plan as Record<string, unknown>);
    setResumeData(result.resume_data);
    setSummary(String(result.resume_data.summary ?? ""));
    setSessionPlan(result.plan, session?.providers, {
      resumeData: result.resume_data,
      jobId: session?.jobId,
    });
    setRejected(result.rejected_edits);
    setIssues(result.validation.issues);
    setEdits({});
    setRevision((value) => value + 1);
    return result.resume_data;
  }

  async function run(next: Exclude<Action, null>, work: () => Promise<void>) {
    setAction(next);
    setError(null);
    try {
      await work();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setAction(null);
    }
  }

  /** Unvalidated edits must not be silently left out of a download. */
  const currentResume = () =>
    pending ? validateEdits() : Promise.resolve(resumeData!);

  const buildPdf = () =>
    run("build", async () => {
      const resume = await currentResume();
      const url = URL.createObjectURL(await postRender(resume as never));
      setPdf((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return { url, resume };
      });
    });

  const downloadWord = () =>
    run("word", async () => {
      const resume = await currentResume();
      saveBlob(
        await postRenderDocx(resume as never),
        resumeFilename(resume, "docx"),
      );
    });

  // The preview is the point of this page, so it doesn't wait to be asked.
  useEffect(() => {
    if (started.current || !plan || !resumeData) return;
    started.current = true;
    void buildPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (pdf) URL.revokeObjectURL(pdf.url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pdf?.url],
  );

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

  /** Saves a number as a fact in the graph, then puts it in the bullet. */
  const addNumber = (id: string, value: string, currentText: string) =>
    run("check", async () => {
      const achievement = await fetchGraphAchievement(id);
      await updateGraphAchievement(id, {
        metrics: [...achievement.metrics, value],
      });
      const next = {
        ...edits,
        [id]: `${currentText.trim().replace(/\.$/, "")}; ${value}.`,
      };
      setEdits(next);
      await validateEdits(next);
    });

  const rewrites = rewritesOf(plan) as Record<string, RewriteEntry>;
  const entries = Object.entries(rewrites);
  const numbered = entries.filter(([id, entry]) =>
    hasDigit(edits[id] ?? entry.rewritten_text),
  ).length;
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
  const unevidenced = diff?.missing_no_evidence ?? [];
  const unknownTerms = diff?.unknown_jd_terms ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review your resume"
        lede="Every bullet traces back to your graph. Edit any wording; one bullet per line."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              loading={action === "word"}
              onClick={downloadWord}
            >
              {action === "word" ? "Preparing Word…" : "Download Word"}
            </Button>
            {pdf && !stale && !busy && (
              <Button
                onClick={() => {
                  const anchor = document.createElement("a");
                  anchor.href = pdf.url;
                  anchor.download = resumeFilename(resumeData, "pdf");
                  anchor.click();
                }}
              >
                Download PDF
              </Button>
            )}
          </>
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
        <Alert role="alert" tone="review" title="These edits weren't kept">
          <ul className="list-inside list-disc">
            {rejected.map((id) => (
              <li key={id}>
                {id}: {(rewrites[id]?.issues ?? []).join("; ")}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            To use a new number, add it with "Add a number" on that bullet.
          </p>
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
      {error && <Alert role="alert">{error}</Alert>}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2">
              {numbered} of {entries.length} points have a number.
            </p>
            <Button
              variant="secondary"
              disabled={busy || !pending}
              loading={action === "check"}
              onClick={() =>
                run("check", async () => void (await validateEdits()))
              }
            >
              {action === "check" ? "Checking…" : "Check my edits"}
            </Button>
          </div>

          <Card className="p-5">
            <label className="block text-sm font-medium text-ink">
              Summary
              <Textarea
                className="mt-1.5"
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
          </Card>

          {entries.map(([id, entry]) => (
            <BulletCard
              key={id}
              id={id}
              entry={entry}
              revision={revision}
              text={edits[id] ?? entry.rewritten_text}
              disabled={busy}
              onEdit={(text) =>
                setEdits((previous) => ({ ...previous, [id]: text }))
              }
              onAddNumber={(value) =>
                addNumber(id, value, edits[id] ?? entry.rewritten_text)
              }
            />
          ))}

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
                    key={String(
                      item.id ?? item.Requirement ?? item.name ?? index,
                    )}
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
        </div>

        <section
          aria-label="Resume preview"
          className="min-w-0 xl:sticky xl:top-6"
        >
          <Card className="gap-0 overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
              <h2 className="text-sm font-semibold">Preview</h2>
              <Button
                variant={stale || !pdf ? "primary" : "secondary"}
                disabled={busy}
                loading={action === "build"}
                onClick={buildPdf}
              >
                {action === "build"
                  ? "Building PDF…"
                  : pdf
                    ? "Rebuild PDF"
                    : "Build PDF"}
              </Button>
            </div>
            {stale && action !== "build" && (
              <p className="border-b border-line bg-surface-2 px-3 py-2 text-xs text-review">
                You've made changes since this PDF was built.
              </p>
            )}
            <div
              aria-busy={action === "build"}
              className="relative h-[80vh] bg-surface-2"
            >
              {pdf && (
                <iframe
                  title="Rendered resume PDF"
                  src={pdf.url}
                  className="size-full"
                />
              )}
              {action === "build" && (
                <div
                  role="status"
                  className="absolute inset-0 flex items-center justify-center gap-2 bg-surface-2/90 text-sm text-ink-2"
                >
                  <SpinnerIcon className="size-4 animate-spin" />
                  Building your PDF…
                </div>
              )}
              {!pdf && action !== "build" && (
                <p className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-2">
                  {error ? "The PDF wasn't built." : "Your PDF appears here."}
                </p>
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

function BulletCard({
  id,
  entry,
  revision,
  text,
  disabled,
  onEdit,
  onAddNumber,
}: {
  id: string;
  entry: RewriteEntry;
  revision: number;
  text: string;
  disabled: boolean;
  onEdit: (text: string) => void;
  onAddNumber: (value: string) => void;
}) {
  const [number, setNumber] = useState("");
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-xs text-ink-2">{id}</h3>
        <div className="flex items-center gap-2">
          {!hasDigit(text) && <DotBadge color="review">No number</DotBadge>}
          <DotBadge color={entry.used_rewrite ? "brand" : "st-wishlist"}>
            {entry.used_rewrite ? "AI rewrite" : "From your graph"}
          </DotBadge>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-2">
        <span className="font-medium">Your source: </span>
        {entry.source_text}
      </p>
      <label className="mt-3 block text-xs font-medium text-ink-2">
        Resume text
        <Textarea
          key={revision}
          className="mt-1.5 p-3 leading-relaxed"
          rows={Math.max(2, text.split("\n").length + 1)}
          defaultValue={entry.rewritten_text}
          onChange={(event) => onEdit(event.target.value)}
        />
      </label>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!number.trim()) return;
          onAddNumber(number.trim());
          setNumber("");
        }}
      >
        <Input
          aria-label={`Add a number to ${id}`}
          className="min-w-48 flex-1"
          placeholder="Add a number: 40% faster, 500 users, 10+ pages"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={disabled || !number.trim()}
        >
          Add a number
        </Button>
      </form>
      <p className="mt-1.5 text-xs text-ink-2">
        Saved to your knowledge graph, so only add what's true.
      </p>
    </Card>
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
