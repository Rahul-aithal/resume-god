import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ROLE_STATUSES } from "@resume-god/api-client";
import {
  buttonVariants,
  Card,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "../components/ui";
import { fetchDashboard } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function DashboardPage() {
  const auth = useAuth();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });

  if (dashboard.isPending) {
    return (
      <div aria-busy="true" className="space-y-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <p role="alert" className="text-sm text-danger">
        Failed to load dashboard: {String(dashboard.error)}
      </p>
    );
  }

  const data = dashboard.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        lede={
          auth.isAuthenticated
            ? "Your pipeline, scoped to your account."
            : "Signed out — log in to see your pipeline."
        }
        actions={
          <Link to="/jobs/new" className={buttonVariants("primary")}>
            + New application
          </Link>
        }
      />

      {/* Stat strip: one panel, internal hairline dividers. */}
      <Card className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        <Stat value={data.company_count} label="Companies" />
        <Stat value={data.role_count} label="Roles" />
        <Stat value={data.by_status["interview"] ?? 0} label="In interview" />
        <Stat value={data.by_status["offer"] ?? 0} label="Offers" />
      </Card>

      <section>
        <h2 className="text-[13px] font-medium text-ink-2">Pipeline</h2>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
          {ROLE_STATUSES.map((status) => (
            <StatusBadge
              key={status}
              status={status}
              count={data.by_status[status] ?? 0}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[13px] font-medium text-ink-2">Recent roles</h2>
        {data.recent_roles.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-2">
            No roles yet —{" "}
            <Link to="/jobs/new" className="text-brand hover:underline">
              tailor your first application
            </Link>
            .
          </p>
        ) : (
          <Card className="mt-2.5">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="px-4 py-2.5 font-normal">Company</th>
                  <th className="px-4 py-2.5 font-normal">Role</th>
                  <th className="px-4 py-2.5 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_roles.map((role) => (
                  <tr
                    key={role.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-surface-2/60"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/companies/${role.company_id}`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {role.company_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">
                      <Link
                        to={`/roles/${role.id}`}
                        className="hover:text-brand hover:underline"
                      >
                        {role.target_title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={role.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {data.recent_artifacts.length > 0 && (
        <section>
          <h2 className="text-[13px] font-medium text-ink-2">
            Recent generated files
          </h2>
          <ul className="mt-2.5 space-y-1.5 text-[13px] text-ink-2">
            {data.recent_artifacts.map((artifact) => (
              <li key={artifact.id} className="flex justify-between gap-4">
                <span className="truncate font-mono text-xs">
                  {artifact.path}
                </span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                  {artifact.kind}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <p className="tnum text-[22px] font-semibold tracking-tight text-ink">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-2">{label}</p>
    </div>
  );
}
