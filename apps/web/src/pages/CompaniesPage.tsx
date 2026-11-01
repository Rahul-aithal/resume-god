import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  controlCls,
} from "../components/ui";
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
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        lede="Every application belongs to a company record."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {companies.isPending && (
            <div aria-busy="true" className="space-y-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          )}
          {companies.isError && (
            <Alert role="alert">{String(companies.error)}</Alert>
          )}
          {companies.data &&
            (companies.data.companies.length === 0 ? (
              <EmptyState title="No companies yet">
                Add your first one with the form on the right.
              </EmptyState>
            ) : (
              <ul className="space-y-2.5">
                {companies.data.companies.map((company) => (
                  <li key={company.id}>
                    <Card className="p-4 transition-colors hover:border-accent/40">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/companies/${company.id}`}
                            className="font-semibold text-accent hover:underline"
                          >
                            {company.name}
                          </Link>
                          {company.location && (
                            <span className="ml-2 text-sm text-ink-2">
                              {company.location}
                            </span>
                          )}
                          {company.website && (
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-sm text-accent hover:underline"
                            >
                              website
                            </a>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">
                          {company.role_count} role
                          {company.role_count === 1 ? "" : "s"}
                        </span>
                      </div>
                      {company.about && (
                        <p className="mt-2 line-clamp-2 text-sm text-ink-2">
                          {company.about}
                        </p>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            ))}
        </div>

        <Card className="h-fit p-5">
          <h2 className="text-sm font-semibold">Add / update company</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <input
              className={controlCls}
              placeholder="Company name (e.g. Goodspace)"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <input
              className={controlCls}
              placeholder="Website"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
            <input
              className={controlCls}
              placeholder="Location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
            <textarea
              className={controlCls}
              placeholder="All data about the company…"
              rows={4}
              value={about}
              onChange={(event) => setAbout(event.target.value)}
            />
            {error && <Alert role="alert">{error}</Alert>}
            <Button
              type="submit"
              loading={create.isPending}
              disabled={!name.trim()}
              className="w-full"
            >
              {create.isPending ? "Saving…" : "Add company"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
