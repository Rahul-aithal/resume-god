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

function gapsOf(plan: Record<string, unknown>): Record<string, unknown> {
  return (plan.gap_report as Record<string, unknown> | undefined) ?? {};
}

export default function ReviewPage() {
  const session = getSessionPlan();
  const [plan, setPlan] = useState<Record<string, unknown> | null>(
    (session?.plan as Record<string, unknown> | undefined) ?? null,
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [rejected, setRejected] = useState<string[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!plan) {
    return (
      <div>
        <h1>Review</h1>
        <p>
          No plan loaded. <Link to="/jobs/new">Tailor a job first</Link>.
        </p>
      </div>
    );
  }

  const rewrites = rewritesOf(plan);

  async function submitReview() {
    setBusy(true);
    setError(null);
    try {
      const result = await postReview(plan as never, edits);
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
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "resume.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error_) {
      setError(String(error_));
    } finally {
      setBusy(false);
    }
  }

  const gaps = gapsOf(plan);
  const unevidenced =
    (gaps.matched_but_unevidenced_skills as unknown[] | undefined) ?? [];

  return (
    <div>
      <h1>Review the AI plan</h1>
      {session?.providers && (
        <p>
          Parsing: {(session.providers.parsing as { used?: string })?.used} ·
          Selection: {(session.providers.selection as { used?: string })?.used}{" "}
          · Rewriting:{" "}
          {(session.providers.rewriting as { used?: string })?.used}
        </p>
      )}
      {rejected.length > 0 && (
        <p role="alert">
          Rejected edits (reverted to reviewed originals): {rejected.join(", ")}
        </p>
      )}
      {issues.length > 0 && (
        <ul>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {Object.entries(rewrites).map(([id, record]) => {
        const entry = record as {
          source_text: string;
          rewritten_text: string;
          used_rewrite: boolean;
          status: string;
        };
        return (
          <article key={id}>
            <h3>{id}</h3>
            <p>
              <strong>Reviewed source:</strong> {entry.source_text}
            </p>
            <label>
              AI wording (edit to override)
              <textarea
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
            <p>
              Status: {entry.used_rewrite ? "AI rewrite used" : "original"} (
              {entry.status})
            </p>
          </article>
        );
      })}
      <h2>Coverage gaps</h2>
      <ul>
        {coverageOf(plan).map((row) => {
          const item = row as Record<string, string>;
          return (
            <li key={String(item.id ?? item.Requirement ?? item.name)}>
              {String(item.Requirement ?? item.name ?? JSON.stringify(item))} —{" "}
              {String(item.Status ?? item.status ?? "")}
            </li>
          );
        })}
      </ul>
      {unevidenced.length > 0 && (
        <p>Matched but unevidenced: {unevidenced.length} skill(s).</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={submitReview}>
        {busy ? "Working…" : "Validate my edits"}
      </button>{" "}
      <button disabled={busy} onClick={renderPdf}>
        Render PDF
      </button>
    </div>
  );
}
