import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchRoleHistory } from "../lib/api";
import RoleStatusEditor from "../components/RoleStatusEditor";

export default function RoleDetailPage() {
  const { id } = useParams();
  const roleId = Number(id);
  const history = useQuery({
    queryKey: ["role", roleId],
    queryFn: () => fetchRoleHistory(roleId),
    enabled: Number.isFinite(roleId),
  });

  if (!Number.isFinite(roleId)) {
    return <p className="text-rose-600">Invalid role id.</p>;
  }
  if (history.isPending) return <p className="text-slate-500">Loading role…</p>;
  if (history.isError || !history.data) {
    return (
      <p role="alert" className="text-rose-600">
        Role not found: {String(history.error)}
      </p>
    );
  }

  const { role, history: entries } = history.data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{role.target_title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              <Link
                to={`/companies/${role.company_id}`}
                className="text-indigo-600 hover:underline"
              >
                {role.company_name ?? "Company"}
              </Link>
              {role.location ? ` · ${role.location}` : ""}
              {role.salary ? ` · ${role.salary}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
              {role.status}
            </span>
            <RoleStatusEditor roleId={role.id} status={role.status} />
          </div>
        </div>
        {role.job_url && (
          <a
            href={role.job_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm text-indigo-600 hover:underline"
          >
            Job posting ↗
          </a>
        )}
        {role.notes && (
          <p className="mt-3 text-sm text-slate-600">{role.notes}</p>
        )}
        <Link
          to={`/jobs/new?companyId=${role.company_id}&title=${encodeURIComponent(role.target_title)}`}
          className="mt-4 inline-block rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
        >
          Tailor a new resume for this role
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Application history</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No history recorded.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 border-l-2 border-indigo-200 pl-3 text-sm"
              >
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
                  {entry.status}
                </span>
                <span className="text-slate-500">
                  {entry.created_at
                    ? entry.created_at.slice(0, 16).replace("T", " ")
                    : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
