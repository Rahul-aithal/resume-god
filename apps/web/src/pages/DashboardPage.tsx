import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ROLE_STATUSES } from "@resume-god/api-client";
import { fetchDashboard } from "../lib/api";
import { useAuth } from "../lib/auth";

const statusBadge: Record<string, string> = {
  wishlist: "bg-slate-100 text-slate-700",
  applied: "bg-blue-100 text-blue-700",
  oa: "bg-amber-100 text-amber-700",
  interview: "bg-violet-100 text-violet-700",
  offer: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

export default function DashboardPage() {
  const auth = useAuth();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });

  if (dashboard.isPending) {
    return <p className="text-slate-500">Loading your pipeline…</p>;
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <p role="alert" className="text-rose-600">
        Failed to load dashboard: {String(dashboard.error)}
      </p>
    );
  }

  const data = dashboard.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Signed in{auth.isAuthenticated ? "" : " out"} — everything below is
            scoped to your account.
          </p>
        </div>
        <Link
          to="/jobs/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New application
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-3xl font-bold">{data.company_count}</p>
          <p className="text-sm text-slate-500">Companies</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-3xl font-bold">{data.role_count}</p>
          <p className="text-sm text-slate-500">Roles</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-3xl font-bold">
            {data.by_status["interview"] ?? 0}
          </p>
          <p className="text-sm text-slate-500">In interview</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-3xl font-bold">{data.by_status["offer"] ?? 0}</p>
          <p className="text-sm text-slate-500">Offers</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Pipeline</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ROLE_STATUSES.map((status) => (
            <span
              key={status}
              className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadge[status] ?? "bg-slate-100"}`}
            >
              {status}: {data.by_status[status] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Recent roles</h2>
        {data.recent_roles.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No roles yet —{" "}
            <Link to="/jobs/new" className="text-indigo-600 hover:underline">
              tailor your first application
            </Link>
            .
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Company</th>
                <th className="py-2">Role</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_roles.map((role) => (
                <tr key={role.id} className="border-t border-slate-100">
                  <td className="py-2">
                    <Link
                      to={`/companies/${role.company_id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {role.company_name}
                    </Link>
                  </td>
                  <td className="py-2">
                    <Link to={`/roles/${role.id}`} className="hover:underline">
                      {role.target_title}
                    </Link>
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[role.status] ?? "bg-slate-100"}`}
                    >
                      {role.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data.recent_artifacts.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">Recent generated files</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {data.recent_artifacts.map((artifact) => (
              <li key={artifact.id} className="flex justify-between gap-4">
                <span className="truncate font-mono text-xs">
                  {artifact.path}
                </span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                  {artifact.kind}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
