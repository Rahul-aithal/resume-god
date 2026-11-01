import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Skeleton,
  Input,
  Textarea,
} from "../components/ui";
import { createCompany, fetchCompanies } from "../lib/api";

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: fetchCompanies,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        lede="Type a name to add one — details can come later."
      />
      <QuickAdd />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {companies.isPending && (
            <div aria-busy="true" className="space-y-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          )}
          {companies.isError && (
            <Alert role="alert">{String(companies.error)}</Alert>
          )}
          {companies.data &&
            (companies.data.companies.length === 0 ? (
              <EmptyState title="No companies yet">
                Type a name in the box above and press Enter.
              </EmptyState>
            ) : (
              <ul className="space-y-2.5">
                {companies.data.companies.map((company) => (
                  <li key={company.id}>
                    <Card className="p-4 transition-colors hover:ring-foreground/20">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/companies/${company.id}`}
                            className="font-semibold text-brand hover:underline"
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
                              className="ml-2 text-sm text-brand hover:underline"
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
          <DetailsForm />
        </Card>
      </div>
    </div>
  );
}

/** One-field quick add: a name is enough to create a company record. The
 * server upserts by name, so details can be attached later. */
function QuickAdd() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createCompany({ name }),
    onSuccess: () => {
      setName("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => setError(String(err)),
  });

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <Input
        placeholder="Add a company (e.g. Goodspace) and press Enter"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Company name"
      />
      <Button
        type="submit"
        loading={create.isPending}
        disabled={!name.trim()}
        className="shrink-0"
      >
        Add company
      </Button>
      {error && <Alert role="alert">{error}</Alert>}
    </form>
  );
}

/** Details form: same-name upsert attaches website/location/about to an
 * existing record created via quick add. */
function DetailsForm() {
  const queryClient = useQueryClient();
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
    <>
      <h2 className="text-sm font-semibold">Add / update details</h2>
      <p className="mt-1 text-xs text-ink-2">
        Existing name? Only the fields you fill in are updated.
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Field label="Company name">
          <Input
            placeholder="e.g. Goodspace"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Input
          placeholder="Website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
        <Input
          placeholder="Location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
        <Textarea
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
          {create.isPending ? "Saving…" : "Save details"}
        </Button>
      </form>
    </>
  );
}
