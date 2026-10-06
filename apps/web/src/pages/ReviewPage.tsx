import { useState } from "react";
import { Link } from "react-router-dom";
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
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-2xl font-bold">Review</h1>
        <p className="mt-2 text-slate-500">
          No plan loaded. Tailor a job first — the plan will wait for you here
          (even after a reload).
        </p>
        <Link
          to="/jobs/new"
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New application
        </Link>
      </div>
    );
  }

  const rewrites = rewritesOf(plan);
  const diff = diffOf(plan);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Review the AI plan</h1>
          {session?.providers && (
            <p className="mt-1 text-sm text-slate-500">
              Parsing: {(session.providers.parsing as { used?: string })?.used}{" "}
              · Selection:{" "}
              {(session.providers.selection as { used?: string })?.used} ·
              Rewriting:{" "}
              {(session.providers.rewriting as { used?: string })?.used}
            </p>
          )}
        </div>
        {pdfUrl && (
          <button
            onClick={downloadPdf}
            className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Download PDF
          </button>
        )}
      </div>

      {rejected.length > 0 && (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
        >
          Rejected edits (reverted to reviewed originals): {rejected.join(", ")}
        </p>
      )}
      {issues.length > 0 && (
        <ul className="list-inside list-disc rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      {diff && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">
            Skill diff — they expect vs you have
          </h2>
          {diff.summary && (
            <p className="mt-1 text-sm text-slate-600">{diff.summary}</p>
          )}
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <SkillList
              title={`Direct evidence (${diff.have?.length ?? 0})`}
              skills={diff.have}
              tone="text-emerald-700"
            />
            <SkillList
              title={`Inferred (${diff.inferred?.length ?? 0})`}
              skills={diff.inferred}
              tone="text-blue-700"
            />
            <SkillList
              title={`Missing — no evidence (${unevidenced.length})`}
              skills={unevidenced}
              tone="text-rose-700"
            />
            <SkillList
              title={`Unknown JD terms (${unknownTerms.length})`}
              skills={unknownTerms}
              tone="text-slate-500"
            />
          </div>
        </div>
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
            <article
              key={id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono text-xs text-slate-400">{id}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    entry.used_rewrite
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {entry.used_rewrite ? "AI rewrite used" : "original"} (
                  {entry.status})
                </span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Reviewed source
                  </p>
                  <p className="mt-1 rounded-lg bg-slate-50 p-3 text-sm">
                    {entry.source_text}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">
                    AI wording (edit to override)
                    <textarea
                      className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
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
            </article>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Coverage</h2>
        <ul className="mt-2 space-y-1 text-sm">
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
              >
                <span
                  className={`mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                    covered
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {status || "?"}
                </span>
                {String(item.Requirement ?? item.name ?? JSON.stringify(item))}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium">
          Summary override (optional, applies to review + render)
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
            rows={2}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Leave empty to keep the reviewed profile summary"
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          disabled={busy}
          onClick={submitReview}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Working…" : "Validate my edits"}
        </button>
        <button
          disabled={busy}
          onClick={renderPdf}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Rendering…" : "Render PDF"}
        </button>
      </div>

      {pdfUrl && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">Rendered resume</h2>
          <iframe
            title="Rendered resume PDF"
            src={pdfUrl}
            className="mt-3 h-[700px] w-full rounded-lg border border-slate-200"
          />
        </div>
      )}
    </div>
  );
}

function SkillList({
  title,
  skills,
  tone,
}: {
  title: string;
  skills?: { name?: string }[];
  tone: string;
}) {
  return (
    <div>
      <p className={`text-xs font-semibold ${tone}`}>{title}</p>
      <p className="mt-1 text-slate-600">
        {(skills ?? [])
          .map((skill) => skill.name)
          .filter(Boolean)
          .join(", ") || "—"}
      </p>
    </div>
  );
}
