import {
  ConflictException,
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
import { TailoringInputError } from "../pipeline/jd-parser";
import { TrackerRepository } from "../tracker/tracker.repository";
import {
  TailorService,
  type TailorResult,
  type TailorStage,
} from "./tailor.service";
import {
  JOB_CONCURRENCY,
  JOB_HEARTBEAT_MS,
  JOB_LIST_LIMIT,
  JOB_MAX_ACTIVE_PER_USER,
  JOB_MAX_ATTEMPTS,
  JOB_POLL_MS,
  JOB_ROLE_LOOKUP_LIMIT,
  JOB_STALE_AFTER_MS,
} from "./constants/tailor.constants";
import type { TailorJobRequestDto } from "./dto/tailor.dto";

export type TailorJobInput = TailorJobRequestDto;

interface Account {
  id: string;
  display_name: string;
  email: string;
}

type Stored = { account: Omit<Account, "id">; request: TailorJobInput };
type JobRow = typeof tailorJobs.$inferSelect;

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
    this.poller = setInterval(() => void this.drain(), JOB_POLL_MS);
    void this.drain();
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.poller);
    await Promise.allSettled(this.running);
  }

  async enqueue(account: Account, request: TailorJobInput) {
    const companyLabel = await this.companyLabel(account.id, request);
    await this.assertCapacity(account.id);
    const [row] = await this.db
      .insert(tailorJobs)
      .values(this.newJob(account, request, companyLabel))
      .returning();
    this.logger.log(`Job ${row.id} queued: ${this.describeRow(row)}`);
    void this.drain();
    return this.summary(row);
  }

  /**
   * A failed job is replaced, not reset: a process that lost this job and is
   * somehow still running can't write its old result over the new attempt.
   */
  async retry(account: Account, jobId: string, edited?: TailorJobInput) {
    const [failed] = await this.db
      .select()
      .from(tailorJobs)
      .where(and(eq(tailorJobs.id, jobId), eq(tailorJobs.userId, account.id)));
    if (!failed) throw new NotFoundException("Job not found");
    const request = edited ?? (failed.input as Stored).request;
    const companyLabel = await this.companyLabel(account.id, request);
    await this.assertCapacity(account.id);
    const row = await this.db.transaction(async (tx) => {
      // The status check makes a double click fail instead of queueing twice.
      const removed = await tx
        .delete(tailorJobs)
        .where(
          and(
            eq(tailorJobs.id, jobId),
            eq(tailorJobs.userId, account.id),
            eq(tailorJobs.status, "failed"),
          ),
        )
        .returning({ id: tailorJobs.id });
      if (removed.length === 0) {
        throw new ConflictException("Only a failed job can be retried.");
      }
      const [created] = await tx
        .insert(tailorJobs)
        .values(this.newJob(account, request, companyLabel))
        .returning();
      return created;
    });
    this.logger.log(
      `Job ${row.id} queued as a retry of ${jobId}${edited ? " with edits" : ""}: ${this.describeRow(row)}`,
    );
    void this.drain();
    return this.summary(row);
  }

  /** Fail now rather than in the background if the company is wrong. */
  private async companyLabel(userId: string, request: TailorJobInput) {
    if (request.company_id == null) return request.company_name?.trim() ?? "";
    return (await this.tracker.getCompany(userId, request.company_id)).name;
  }

  private async assertCapacity(userId: string) {
    const [{ active }] = await this.db
      .select({ active: sql<number>`count(*)::int` })
      .from(tailorJobs)
      .where(
        and(
          eq(tailorJobs.userId, userId),
          inArray(tailorJobs.status, ["queued", "running"]),
        ),
      );
    if (active >= JOB_MAX_ACTIVE_PER_USER) {
      throw new HttpException(
        `You already have ${active} jobs in progress. Wait for one to finish.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private newJob(
    { id, display_name, email }: Account,
    request: TailorJobInput,
    companyLabel: string,
  ) {
    return {
      id: crypto.randomUUID(),
      userId: id,
      targetTitle: request.target_title?.trim() ?? "",
      companyLabel,
      input: { account: { display_name, email }, request } satisfies Stored,
    };
  }

  /** Quoted because titles are user text and must not forge log lines. Job
   * descriptions and emails stay out of the logs. */
  private describeRow(row: JobRow): string {
    return `user=${row.userId} title=${JSON.stringify(row.targetTitle)} company=${JSON.stringify(row.companyLabel)}`;
  }

  async list(userId: string) {
    const rows = await this.db
      .select()
      .from(tailorJobs)
      .where(eq(tailorJobs.userId, userId))
      .orderBy(desc(tailorJobs.createdAt))
      .limit(JOB_LIST_LIMIT);
    return { jobs: rows.map((row) => this.summary(row)) };
  }

  async get(userId: string, jobId: string) {
    const [row] = await this.db
      .select()
      .from(tailorJobs)
      .where(and(eq(tailorJobs.id, jobId), eq(tailorJobs.userId, userId)));
    if (!row) throw new NotFoundException("Job not found");
    return {
      ...this.summary(row),
      request: (row.input as Stored).request,
      result: row.result,
    };
  }

  /** Keeps reviewed edits with the job, alongside what the run recorded. */
  async saveReview(
    userId: string,
    jobId: string,
    review: {
      plan: Record<string, unknown>;
      resume_data: unknown;
      validation: unknown;
    },
  ) {
    await this.db
      .update(tailorJobs)
      .set({
        result: sql`coalesce(${tailorJobs.result}, '{}'::jsonb) || ${JSON.stringify(review)}::jsonb`,
      })
      .where(and(eq(tailorJobs.id, jobId), eq(tailorJobs.userId, userId)));
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
    while (!this.stopped && this.running.size < JOB_CONCURRENCY) {
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
    const cutoff = new Date(Date.now() - JOB_STALE_AFTER_MS).toISOString();
    const stale = sql`${tailorJobs.status} = 'running' and ${tailorJobs.heartbeatAt} < ${cutoff}::timestamp`;
    const abandoned = await this.db
      .update(tailorJobs)
      .set({
        status: "failed",
        stage: null,
        error: "This job kept stopping unexpectedly. Try again.",
        finishedAt: new Date(),
      })
      .where(sql`${stale} and ${tailorJobs.attempts} >= ${JOB_MAX_ATTEMPTS}`)
      .returning({ id: tailorJobs.id });
    for (const { id } of abandoned) {
      this.logger.error(
        `Job ${id} failed: stopped responding ${JOB_MAX_ATTEMPTS} times`,
      );
    }
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
    const startedAt = Date.now();
    this.logger.log(
      `Job ${job.id} started (attempt ${job.attempts}): ${this.describeRow(job)}`,
    );
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
    }, JOB_HEARTBEAT_MS);
    try {
      const result = await this.tailor.tailor(job.userId, account, request, {
        onStage: (stage: TailorStage) => {
          this.logger.log(`Job ${job.id} stage: ${stage}`);
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
      this.logFinished(job.id, Date.now() - startedAt, request, result);
      if (warning) this.logger.warn(`Job ${job.id}: ${warning}`);
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

  /** Fallbacks and title differences don't fail a job, but explain its result. */
  private logFinished(
    jobId: string,
    elapsedMs: number,
    request: TailorJobInput,
    result: TailorResult,
  ) {
    const stages = Object.entries(result.providers);
    const used = stages.map(([stage, info]) => `${stage}=${info.used}`);
    this.logger.log(
      `Job ${jobId} succeeded in ${elapsedMs}ms (${used.join(" ")})`,
    );
    for (const [stage, info] of stages) {
      if (info.fallback_error) {
        this.logger.warn(
          `Job ${jobId} ${stage} fell back: ${info.fallback_error}`,
        );
      }
    }
    const requested = request.target_title?.trim();
    const parse = result.plan.job_description_parse as
      { role_title?: unknown } | undefined;
    const found = String(parse?.role_title ?? "").trim();
    if (requested && found && requested !== found) {
      this.logger.log(
        `Job ${jobId} title: requested ${JSON.stringify(requested)}, job description reads ${JSON.stringify(found)}`,
      );
    }
  }

  /** Every failure is logged. Only ones written for the user are shown to them. */
  private describe(jobId: string, error: unknown): string {
    if (
      error instanceof HttpException ||
      error instanceof TailoringInputError
    ) {
      this.logger.warn(`Job ${jobId} failed: ${error.message}`);
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
          limit: JOB_ROLE_LOOKUP_LIMIT,
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
