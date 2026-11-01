import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import RoleStatusEditor from "../components/RoleStatusEditor";
import { Alert, Card, Skeleton, StatusBadge } from "../components/ui";
import { fetchRoleHistory } from "../lib/api";

export default function RoleDetailPage() {
  const { id } = useParams();
  const roleId = Number(id);
  const history = useQuery({
    queryKey: ["role", roleId],
    queryFn: () => fetchRoleHistory(roleId),
    enabled: Number.isFinite(roleId),
  });

  if (!Number.isFinite(roleId)) {
    return <Alert role="alert">Invalid role id.</Alert>;
  }
  if (history.isPending)
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  if (history.isError || !history.data) {
    return <Alert role="alert">Role not found: {String(history.error)}</Alert>;
  }

  const { role, history: entries } = history.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-2">
        <Link to="/companies" className="hover:text-brand hover:underline">
          Companies
        </Link>
        <span aria-hidden>/</span>
        <Link
          to={`/companies/${role.company_id}`}
          className="hover:text-brand hover:underline"
        >
          {role.company_name ?? "Company"}
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate font-medium text-ink">
          {role.target_title}
        </span>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {role.target_title}
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              {role.location ? role.location : ""}
              {role.location && role.salary ? " · " : ""}
              {role.salary ? role.salary : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={role.status} />
            <RoleStatusEditor roleId={role.id} status={role.status} />
          </div>
        </div>
        {role.job_url && (
          <a
            href={role.job_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm text-brand hover:underline"
          >
            Job posting ↗
          </a>
        )}
        {role.notes && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-2">
            {role.notes}
          </p>
        )}
        <Link
          to={`/jobs/new?companyId=${role.company_id}&title=${encodeURIComponent(role.target_title)}`}
          className="mt-4 inline-block rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          Tailor a new resume for this role
        </Link>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Application history</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">No history recorded.</p>
        ) : (
          <ol className="mt-3 space-y-0">
            {entries.map((entry, index) => (
              <li
                key={entry.id}
                className="relative flex items-center gap-3 py-2 pl-6 text-sm"
              >
                <span
                  aria-hidden
                  className={`absolute left-[5px] h-2 w-2 rounded-full ${
                    index === 0 ? "bg-brand" : "bg-line-strong"
                  }`}
                />
                {index < entries.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[8.5px] top-full h-[calc(100%-0.5rem)] w-px bg-line"
                  />
                )}
                <StatusBadge status={entry.status} />
                <span className="text-ink-2">
                  {entry.created_at
                    ? entry.created_at.slice(0, 16).replace("T", " ")
                    : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
