import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { AppDb } from "../db/client";
import { APP_DB } from "../db/database.module";
import { tailorJobs } from "../db/schema";
import { TrackerRepository } from "../tracker/tracker.repository";
import { TailorService, type TailorStage } from "./tailor.service";

export interface TailorJobInput {
  jd_text: string;
  target_title?: string;
  max_achievements?: number;
  provider?: string;
  font?: string;
  summary?: string;
  company_id?: number;
  company_name?: string;
  job_url?: string;
  role_status?: string;
}

interface Account {
  id: string;
  display_name: string;
  email: string;
}

type Stored = { account: Omit<Account, "id">; request: TailorJobInput };
type JobRow = typeof tailorJobs.$inferSelect;

/** How many jobs one server runs at once. */
const CONCURRENCY = 2;
/** Finds queued work missed by the direct kick, such as after a restart. */
const POLL_MS = 5_000;
const HEARTBEAT_MS = 30_000;
/** A running job this quiet belonged to a process that died. */
const STALE_AFTER_MS = 2 * 60_000;
const MAX_ATTEMPTS = 3;
/** Per user, so one account can't fill the queue or spend unbounded LLM calls. */
const MAX_ACTIVE_JOBS = 10;
const LIST_LIMIT = 50;

/**
 * Tailoring as a background job. Postgres is the queue: jobs survive restarts,
 * and SKIP LOCKED lets several server processes share the work safely.
 */
@Injectable()
export class TailorJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TailorJobsService.name);
  private readonly running = new Set<Promise<void>>();
  private poller?: ReturnType<typeof setInterval>;
  private stopped = false;

  constructor(
    @Inject(APP_DB) private readonly db: AppDb,
    private readonly tailor: TailorService,
    private readonly tracker: TrackerRepository,
  ) {}

  onModuleInit() {
    this.poller = setInterval(() => void this.drain(), POLL_MS);
    void this.drain();
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.poller);
    await Promise.allSettled(this.running);
  }

  async enqueue(account: Account, request: TailorJobInput) {
    // Fail now rather than in the background if the company is wrong.
    let companyLabel = request.company_name?.trim() ?? "";
    if (request.company_id != null) {
      companyLabel = (
        await this.tracker.getCompany(account.id, request.company_id)
      ).name;
    }
    const [{ active }] = await this.db
      .select({ active: sql<number>`count(*)::int` })
      .from(tailorJobs)
      .where(
        and(
          eq(tailorJobs.userId, account.id),
          inArray(tailorJobs.status, ["queued", "running"]),
        ),
      );
    if (active >= MAX_ACTIVE_JOBS) {
      throw new HttpException(
        `You already have ${active} jobs in progress. Wait for one to finish.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const { id, display_name, email } = account;
    const [row] = await this.db
      .insert(tailorJobs)
      .values({
        id: crypto.randomUUID(),
        userId: id,
        targetTitle: request.target_title?.trim() ?? "",
        companyLabel,
        input: { account: { display_name, email }, request } satisfies Stored,
      })
      .returning();
    void this.drain();
    return this.summary(row);
  }

  async list(userId: string) {
    const rows = await this.db
      .select()
      .from(tailorJobs)
      .where(eq(tailorJobs.userId, userId))
      .orderBy(desc(tailorJobs.createdAt))
      .limit(LIST_LIMIT);
    return { jobs: rows.map((row) => this.summary(row)) };
  }

  async get(userId: string, jobId: string) {
    const [row] = await this.db
      .select()
      .from(tailorJobs)
      .where(and(eq(tailorJobs.id, jobId), eq(tailorJobs.userId, userId)));
    if (!row) throw new NotFoundException("Job not found");
    return { ...this.summary(row), result: row.result };
  }

  /** The list stays light: no job description, plan, or resume. */
  private summary(row: JobRow) {
    return {
      id: row.id,
      status: row.status,
      stage: row.stage,
      target_title: row.targetTitle,
      company: row.companyLabel,
      role_id: row.roleId,
      error: row.error,
      warning: row.warning,
      created_at: row.createdAt.toISOString(),
      started_at: row.startedAt?.toISOString() ?? null,
      finished_at: row.finishedAt?.toISOString() ?? null,
    };
  }

  /** Start jobs until the queue is empty or this process is at capacity. */
  async drain(): Promise<void> {
    while (!this.stopped && this.running.size < CONCURRENCY) {
      let job: JobRow | undefined;
      try {
        job = await this.claim();
      } catch (error) {
        this.logger.error(`Could not claim a job: ${String(error)}`);
        return;
      }
      if (!job) return;
      const run: Promise<void> = this.run(job).finally(() => {
        this.running.delete(run);
        void this.drain();
      });
      this.running.add(run);
    }
  }

  private async claim(): Promise<JobRow | undefined> {
    // Computed here: the columns hold UTC, which the database's now() may not.
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const stale = sql`${tailorJobs.status} = 'running' and ${tailorJobs.heartbeatAt} < ${cutoff}::timestamp`;
    await this.db
      .update(tailorJobs)
      .set({
        status: "failed",
        stage: null,
        error: "This job kept stopping unexpectedly. Try again.",
        finishedAt: new Date(),
      })
      .where(sql`${stale} and ${tailorJobs.attempts} >= ${MAX_ATTEMPTS}`);
    const [row] = await this.db
      .update(tailorJobs)
      .set({
        status: "running",
        stage: "parsing",
        attempts: sql`${tailorJobs.attempts} + 1`,
        heartbeatAt: new Date(),
        startedAt: new Date(),
      })
      .where(
        inArray(
          tailorJobs.id,
          sql`(
            select id from tailor_jobs
            where status = 'queued'
              or (status = 'running' and heartbeat_at < ${cutoff}::timestamp)
            order by created_at
            limit 1
            for update skip locked
          )`,
        ),
      )
      .returning();
    return row;
  }

  private async run(job: JobRow): Promise<void> {
    const { account, request } = job.input as Stored;
    // A reclaimed job has a higher attempt count, so if this process turns out
    // to be alive after all, its late writes match nothing.
    const owned = and(
      eq(tailorJobs.id, job.id),
      eq(tailorJobs.attempts, job.attempts),
    );
    const heartbeat = setInterval(() => {
      void this.db
        .update(tailorJobs)
        .set({ heartbeatAt: new Date() })
        .where(owned)
        .catch(() => undefined);
    }, HEARTBEAT_MS);
    try {
      const result = await this.tailor.tailor(job.userId, account, request, {
        onStage: (stage: TailorStage) => {
          void this.db
            .update(tailorJobs)
            .set({ stage, heartbeatAt: new Date() })
            .where(owned)
            .catch(() => undefined);
        },
      });
      const { roleId, warning } = await this.recordRole(
        job.userId,
        request,
        result.plan.target_title,
      );
      await this.db
        .update(tailorJobs)
        .set({
          status: "succeeded",
          stage: null,
          result,
          roleId,
          warning,
          targetTitle: job.targetTitle || result.plan.target_title,
          finishedAt: new Date(),
        })
        .where(owned);
    } catch (error) {
      await this.db
        .update(tailorJobs)
        .set({
          status: "failed",
          stage: null,
          error: this.describe(job.id, error),
          finishedAt: new Date(),
        })
        .where(owned)
        .catch((failure) =>
          this.logger.error(`Job ${job.id}: ${String(failure)}`),
        );
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** Expected failures explain themselves; anything else stays in the logs. */
  private describe(jobId: string, error: unknown): string {
    if (error instanceof HttpException) return error.message;
    // The pipeline has no HTTP types, but this one is written for the user.
    if (
      error instanceof Error &&
      error.message.startsWith("Target title does not match")
    ) {
      return error.message;
    }
    this.logger.error(
      `Job ${jobId} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    return "Tailoring failed unexpectedly. Try again.";
  }

  /** The resume is the job's point, so a tracker problem doesn't fail it. */
  private async recordRole(
    userId: string,
    request: TailorJobInput,
    planTitle: string,
  ): Promise<{ roleId: number | null; warning: string | null }> {
    const name = request.company_name?.trim();
    if (request.company_id == null && !name) {
      return { roleId: null, warning: null };
    }
    const title = request.target_title?.trim() || planTitle;
    try {
      const companyId =
        request.company_id ??
        (await this.tracker.createCompany(userId, { name: name! })).id;
      const existing = (
        await this.tracker.listRoles(userId, {
          company_id: companyId,
          limit: 500,
          offset: 0,
        })
      ).find((role) => role.target_title === title);
      if (existing) return { roleId: existing.id, warning: null };
      const role = await this.tracker.createRole(userId, {
        company_id: companyId,
        target_title: title,
        status: request.role_status,
        job_url: request.job_url,
      });
      return { roleId: role.id, warning: null };
    } catch (error) {
      this.logger.warn(`Could not record a role: ${String(error)}`);
      return {
        roleId: null,
        warning: "Your resume is ready, but it wasn't added to your tracker.",
      };
    }
  }
}
