import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { createCompany, fetchCompanies } from "../lib/api";

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: fetchCompanies,
  });
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [about, setAbout] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createCompany({ name, website, location, about }),
    onSuccess: () => {
      setName("");
      setWebsite("");
      setLocation("");
      setAbout("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => setError(String(err)),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-bold">Companies</h1>
        {companies.isPending && <p className="mt-2 text-slate-500">Loading…</p>}
        {companies.isError && (
          <p role="alert" className="mt-2 text-rose-600">
            {String(companies.error)}
          </p>
        )}
        {companies.data &&
          (companies.data.companies.length === 0 ? (
            <p className="mt-2 text-slate-500">
              No companies yet — add your first one on the right.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {companies.data.companies.map((company) => (
                <li
                  key={company.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Link
                        to={`/companies/${company.id}`}
                        className="font-semibold text-indigo-700 hover:underline"
                      >
                        {company.name}
                      </Link>
                      {company.location && (
                        <span className="ml-2 text-sm text-slate-500">
                          {company.location}
                        </span>
                      )}
                      {company.website && (
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 text-sm text-indigo-600 hover:underline"
                        >
                          website
                        </a>
                      )}
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                      {company.role_count} role
                      {company.role_count === 1 ? "" : "s"}
                    </span>
                  </div>
                  {company.about && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                      {company.about}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Add / update company</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Company name (e.g. Goodspace)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="All data about the company…"
            rows={4}
            value={about}
            onChange={(event) => setAbout(event.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={create.isPending || !name.trim()}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {create.isPending ? "Saving…" : "Add company"}
          </button>
        </form>
      </div>
    </div>
  );
}
