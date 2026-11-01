import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ROLE_STATUSES } from "@resume-god/api-client";
import RoleStatusEditor from "../components/RoleStatusEditor";
import {
  Alert,
  Button,
  Card,
  Skeleton,
  StatusBadge,
  controlCls,
} from "../components/ui";
import { createRole, fetchCompany } from "../lib/api";

export default function CompanyDetailPage() {
  const { id } = useParams();
  const companyId = Number(id);
  const [showAddRole, setShowAddRole] = useState(false);
  const company = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => fetchCompany(companyId),
    enabled: Number.isFinite(companyId),
  });

  if (!Number.isFinite(companyId)) {
    return <Alert role="alert">Invalid company id.</Alert>;
  }
  if (company.isPending)
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  if (company.isError || !company.data) {
    return (
      <Alert role="alert">Company not found: {String(company.error)}</Alert>
    );
  }

  const data = company.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-2">
        <Link to="/companies" className="hover:text-accent hover:underline">
          Companies
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate font-medium text-ink">{data.name}</span>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {data.name}
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              {data.location || "Location unknown"}
              {data.website && (
                <>
                  {" · "}
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    {data.website}
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to={`/jobs/new?companyId=${data.id}`}
              className="inline-flex h-9 items-center rounded-md bg-btn-primary-bg px-3.5 text-[13px] font-medium text-btn-primary-ink transition-colors hover:bg-btn-primary-bg-hover"
            >
              + Tailor for this company
            </Link>
            <Button
              variant="secondary"
              onClick={() => setShowAddRole((value) => !value)}
            >
              {showAddRole ? "Close" : "+ Add role manually"}
            </Button>
          </div>
        </div>
        {data.about && (
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-2">
            {data.about}
          </p>
        )}
        <p className="mt-3 text-sm font-medium text-ink-2">
          {data.role_count} role{data.role_count === 1 ? "" : "s"} applied
          {Object.keys(data.by_status).length > 0 &&
            ` — by status: ${Object.entries(data.by_status)
              .map(([status, count]) => `${status} ${count}`)
              .join(", ")}`}
        </p>
      </Card>

      {showAddRole && (
        <AddRoleForm companyId={data.id} onDone={() => setShowAddRole(false)} />
      )}

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Roles</h2>
        {data.roles.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">No roles yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-ink-2">
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Applied</th>
                <th className="py-2 font-medium">Set status</th>
              </tr>
            </thead>
            <tbody>
              {data.roles.map((role) => (
                <tr key={role.id} className="border-t border-line">
                  <td className="py-2.5">
                    <Link
                      to={`/roles/${role.id}`}
                      className="font-medium hover:text-accent hover:underline"
                    >
                      {role.target_title}
                    </Link>
                    {role.job_url && (
                      <a
                        href={role.job_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-xs text-accent hover:underline"
                      >
                        posting
                      </a>
                    )}
                  </td>
                  <td className="py-2.5">
                    <StatusBadge status={role.status} />
                  </td>
                  <td className="py-2.5 text-ink-2">
                    {role.created_at ? role.created_at.slice(0, 10) : "—"}
                  </td>
                  <td className="py-2.5">
                    <RoleStatusEditor roleId={role.id} status={role.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function AddRoleForm({
  companyId,
  onDone,
}: {
  companyId: number;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("wishlist");
  const [jobUrl, setJobUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      createRole({
        company_id: companyId,
        target_title: title,
        status,
        job_url: jobUrl,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onDone();
    },
    onError: (err) => setError(String(err)),
  });

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Add role</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            className={controlCls}
            placeholder="Target title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <select
            className={controlCls}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {ROLE_STATUSES.map((status_) => (
              <option key={status_} value={status_}>
                {status_}
              </option>
            ))}
          </select>
          <input
            className={controlCls}
            placeholder="Job posting URL (optional)"
            value={jobUrl}
            onChange={(event) => setJobUrl(event.target.value)}
          />
        </div>
        {error && (
          <Alert role="alert" className="mt-3">
            {error}
          </Alert>
        )}
        <Button
          type="submit"
          loading={create.isPending}
          disabled={create.isPending || !title.trim()}
          className="mt-3"
        >
          {create.isPending ? "Adding…" : "Add role"}
        </Button>
      </form>
    </Card>
  );
}
