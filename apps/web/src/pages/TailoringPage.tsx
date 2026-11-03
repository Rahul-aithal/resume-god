import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { TailorJob } from "@resume-god/api-client";
import { SpinnerIcon } from "../components/icons";
import {
  Alert,
  Button,
  Card,
  DotBadge,
  EmptyState,
  PageHeader,
  Skeleton,
  buttonVariants,
} from "../components/ui";
import { retryTailorJob } from "../lib/api";
import { useOpenJob } from "../lib/use-open-job";
import { isActive, useTailorJobs } from "../lib/use-tailor-jobs";

const STAGE_LABEL: Record<string, string> = {
  parsing: "Reading the job description",
  planning: "Choosing your best evidence",
  rewriting: "Rewriting bullet points",
  finishing: "Building the resume",
};

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function title(job: TailorJob) {
  return job.target_title || "Untitled role";
}

function JobRow({ job }: { job: TailorJob }) {
  const open = useOpenJob(job.id);
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => retryTailorJob(job.id),
    // Stays pending until the list updates, so a second click can't land.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["tailor-jobs"] }),
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4">
      <div className="min-w-0 flex-1 basis-64">
        <p className="truncate text-[13px] font-medium">
          {title(job)}
          {job.company && (
            <span className="font-normal text-ink-2"> at {job.company}</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-ink-2">
          {dateFormat.format(new Date(job.created_at))}
        </p>
        {job.error && (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {job.error}
          </p>
        )}
        {job.warning && (
          <p className="mt-1.5 text-xs text-review">{job.warning}</p>
        )}
        {open.isError && (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            Could not open this plan: {String(open.error)}
          </p>
        )}
        {retry.isError && (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            Could not retry: {retry.error.message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {job.status === "queued" && (
          <DotBadge color="st-wishlist">Waiting to start</DotBadge>
        )}
        {job.status === "running" && (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <SpinnerIcon className="size-3.5 animate-spin" />
            {STAGE_LABEL[job.stage ?? ""] ?? "Working"}
          </span>
        )}
        {job.status === "failed" && (
          <>
            <DotBadge color="danger">Failed</DotBadge>
            <Link
              to={`/jobs/new?retry=${job.id}`}
              className={buttonVariants("ghost")}
            >
              Edit and retry
            </Link>
            <Button loading={retry.isPending} onClick={() => retry.mutate()}>
              Retry
            </Button>
          </>
        )}
        {job.status === "succeeded" && (
          <>
            <DotBadge color="ok">Ready</DotBadge>
            {job.role_id != null && (
              <Link
                to={`/roles/${job.role_id}`}
                className={buttonVariants("ghost")}
              >
                View role
              </Link>
            )}
            <Button loading={open.isPending} onClick={() => open.mutate()}>
              Review
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function JobList({ label, jobs }: { label: string; jobs: TailorJob[] }) {
  return (
    <section aria-label={label}>
      <h2 className="text-[13px] font-medium text-ink-2">{label}</h2>
      <Card className="mt-2.5 gap-0 py-0">
        <ul className="divide-y divide-line">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

export default function TailoringPage() {
  const jobs = useTailorJobs();

  const newApplication = (
    <Link to="/jobs/new" className={buttonVariants("primary")}>
      + New application
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tailoring"
        lede="Resumes are prepared in the background, so you can leave this page."
        actions={newApplication}
      />
      {jobs.isPending && <Skeleton className="h-40 rounded-lg" />}
      {jobs.isError && (
        <Alert role="alert">
          Could not load your jobs: {String(jobs.error)}
        </Alert>
      )}
      {jobs.data &&
        (jobs.data.jobs.length === 0 ? (
          <EmptyState title="Nothing tailoring yet" action={newApplication}>
            Paste a job description to prepare your first resume.
          </EmptyState>
        ) : (
          <>
            {jobs.data.jobs.some(isActive) && (
              <JobList
                label="In progress"
                jobs={jobs.data.jobs.filter(isActive)}
              />
            )}
            {jobs.data.jobs.some((job) => !isActive(job)) && (
              <JobList
                label="Finished"
                jobs={jobs.data.jobs.filter((job) => !isActive(job))}
              />
            )}
          </>
        ))}
    </div>
  );
}
