import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ROLE_STATUSES } from "@resume-god/api-client";
import { createRole, fetchCompany } from "../lib/api";
import RoleStatusEditor from "../components/RoleStatusEditor";

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
    return <p className="text-rose-600">Invalid company id.</p>;
  }
  if (company.isPending)
    return <p className="text-slate-500">Loading company…</p>;
  if (company.isError || !company.data) {
    return (
      <p role="alert" className="text-rose-600">
        Company not found: {String(company.error)}
      </p>
    );
  }

  const data = company.data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{data.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {data.location || "Location unknown"}
              {data.website && (
                <>
                  {" · "}
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline"
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
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Tailor for this company
            </Link>
            <button
              onClick={() => setShowAddRole((value) => !value)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              {showAddRole ? "Close" : "+ Add role manually"}
            </button>
          </div>
        </div>
        {data.about && (
          <p className="mt-4 text-sm text-slate-600">{data.about}</p>
        )}
        <p className="mt-3 text-sm font-medium text-slate-700">
          {data.role_count} role{data.role_count === 1 ? "" : "s"} applied
          {Object.keys(data.by_status).length > 0 &&
            ` — by status: ${Object.entries(data.by_status)
              .map(([status, count]) => `${status} ${count}`)
              .join(", ")}`}
        </p>
      </div>

      {showAddRole && (
        <AddRoleForm companyId={data.id} onDone={() => setShowAddRole(false)} />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Roles</h2>
        {data.roles.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No roles yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Role</th>
                <th className="py-2">Status</th>
                <th className="py-2">Applied</th>
                <th className="py-2">Set status</th>
              </tr>
            </thead>
            <tbody>
              {data.roles.map((role) => (
                <tr key={role.id} className="border-t border-slate-100">
                  <td className="py-2">
                    <Link to={`/roles/${role.id}`} className="hover:underline">
                      {role.target_title}
                    </Link>
                    {role.job_url && (
                      <a
                        href={role.job_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-xs text-indigo-600 hover:underline"
                      >
                        posting
                      </a>
                    )}
                  </td>
                  <td className="py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
                      {role.status}
                    </span>
                  </td>
                  <td className="py-2 text-slate-500">
                    {role.created_at ? role.created_at.slice(0, 10) : "—"}
                  </td>
                  <td className="py-2">
                    <RoleStatusEditor roleId={role.id} status={role.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
    <form
      className="rounded-xl border border-slate-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) create.mutate();
      }}
    >
      <h2 className="font-semibold">Add role</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Target title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Job posting URL (optional)"
          value={jobUrl}
          onChange={(event) => setJobUrl(event.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={create.isPending || !title.trim()}
        className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {create.isPending ? "Adding…" : "Add role"}
      </button>
    </form>
  );
}
