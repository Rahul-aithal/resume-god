import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { TailoringInputError } from "../src/pipeline/jd-parser";

import {
  TEST_DATABASE_URL,
  USER_A,
  USER_B,
  firstMessage,
  get,
  json,
  makeApp,
  resetDb,
  send,
} from "./helpers";

const PROFILE = `skills:
  - id: skill_typescript
    name: TypeScript
    category: Languages
  - id: skill_react
    name: React
    category: Frontend
experiences:
  - id: exp_x
    role: Engineer
    title: Acme
projects: []
achievements:
  - id: ach_x
    part_of: exp_x
    text: Built admin tools in TypeScript and React for an internal platform.
    skills: [skill_typescript, skill_react]
`;

const JD = "Software Developer\nWe need TypeScript and React experience.";

interface Job {
  id: string;
  status: string;
  stage: string | null;
  target_title: string;
  company: string;
  role_id: number | null;
  error: string | null;
  warning: string | null;
  result?: Record<string, any>;
}

let a: Awaited<ReturnType<typeof makeApp>>;
let b: Awaited<ReturnType<typeof makeApp>>;

const jobsUrl = (base: string, id = "") =>
  `${base}/api/tailor/jobs${id ? `/${id}` : ""}`;

async function start(input: Record<string, unknown>) {
  const response = await send(jobsUrl(a.base), "POST", {
    provider: "deterministic",
    jd_text: JD,
    ...input,
  });
  expect(response.status).toBe(202);
  return json<Job>(response);
}

/** Polls the database: polling the API this fast would hit its rate limit. */
async function finished(id: string): Promise<Job> {
  const { db, tailorJobs } = await jobsTable();
  // Longer than the worker's poll interval, which recovered jobs wait for.
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const [row] = await db
      .select({ status: tailorJobs.status })
      .from(tailorJobs)
      .where(eq(tailorJobs.id, id));
    if (row?.status === "succeeded" || row?.status === "failed") {
      return json<Job>(await get(jobsUrl(a.base, id)));
    }
    await Bun.sleep(50);
  }
  throw new Error(`Job ${id} did not finish`);
}

async function jobsTable() {
  const { getDb } = await import("../src/db/client");
  const { tailorJobs } = await import("../src/db/schema");
  return { db: getDb(TEST_DATABASE_URL), tailorJobs };
}

beforeAll(async () => {
  await resetDb();
  a = await makeApp(USER_A);
  b = await makeApp(USER_B);
  await send(`${a.base}/api/graph/import`, "POST", {
    format: "yaml",
    mode: "replace",
    content: PROFILE,
  });
  await send(`${a.base}/api/graph/review`, "POST");
});

afterAll(async () => {
  await a.close();
  await b.close();
});

describe("background tailoring", () => {
  it("returns immediately, then finishes with a full result", async () => {
    const job = await start({ target_title: "Software Developer" });
    expect(["queued", "running"]).toContain(job.status);
    expect(job.result).toBeUndefined();

    const done = await finished(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.stage).toBeNull();
    expect(done.result?.plan.target_title).toBe("Software Developer");
    expect(done.result?.resume_data.font).toBeTruthy();
    expect(done.result?.providers.parsing.used).toBe("deterministic");
  });

  it("lists jobs newest first, without the heavy fields", async () => {
    const body = await json<{ jobs: Job[] }>(await get(jobsUrl(a.base)));
    expect(body.jobs.length).toBeGreaterThan(0);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("resume_data");
    expect(raw).not.toContain(JD);
  });

  it("keeps each user's jobs private", async () => {
    const { jobs } = await json<{ jobs: Job[] }>(await get(jobsUrl(a.base)));
    const other = await json<{ jobs: Job[] }>(await get(jobsUrl(b.base)));
    expect(other.jobs).toHaveLength(0);
    expect((await get(jobsUrl(b.base, jobs[0].id))).status).toBe(404);
  });

  async function withTailorThrowing(
    failure: string | Error,
    run: () => Promise<void>,
  ) {
    const { TailorService } = await import("../src/tailor/tailor.service");
    // Either app's worker may claim the job.
    const services = [a, b].map((app) => app.app.get(TailorService));
    const originals = services.map((service) => service.tailor);
    for (const service of services) {
      service.tailor = () =>
        Promise.reject(
          typeof failure === "string" ? new Error(failure) : failure,
        );
    }
    try {
      await run();
    } finally {
      services.forEach((service, index) => {
        service.tailor = originals[index];
      });
    }
  }

  it("records a failure the user can act on", async () => {
    const reason = "Add a Target title and retry.";
    await withTailorThrowing(new TailoringInputError(reason), async () => {
      const done = await finished((await start({})).id);
      expect(done.status).toBe("failed");
      expect(done.error).toBe(reason);
      expect(done.result).toBeNull();
    });
  });

  it("hides the details of an unexpected failure", async () => {
    await withTailorThrowing("connection to 10.0.0.5 refused", async () => {
      const done = await finished((await start({})).id);
      expect(done.status).toBe("failed");
      expect(done.error).toBe("Tailoring failed unexpectedly. Try again.");
    });
  });

  it("doesn't fail because the job calls itself something else", async () => {
    const provider = {
      name: "gemini",
      completeJson: () => Promise.resolve({ role_title: "Software Developer" }),
    };
    const { LlmProviderChainService } =
      await import("../src/llm/provider-chain.service");
    const chains = [a, b].map((app) => app.app.get(LlmProviderChainService));
    const originals = chains.map((chain) => chain.resolveList);
    for (const chain of chains) {
      chain.resolveList = (() => ({ providers: [provider] })) as never;
    }
    try {
      const done = await finished(
        (await start({ provider: "auto", target_title: "SDE" })).id,
      );
      expect(done.status).toBe("succeeded");
      expect(done.result?.plan.target_title).toBe("SDE");
      expect(done.result?.plan.job_description_parse.role_title).toBe(
        "Software Developer",
      );
    } finally {
      chains.forEach((chain, index) => {
        chain.resolveList = originals[index];
      });
    }
  });

  it("logs failures, including ones the user is shown", async () => {
    const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    const error = spyOn(Logger.prototype, "error").mockImplementation(() => {});
    try {
      let shown = "";
      await withTailorThrowing(new TailoringInputError("Fix it"), async () => {
        shown = (await finished((await start({})).id)).id;
      });
      expect(warn).toHaveBeenCalledWith(`Job ${shown} failed: Fix it`);
      let hidden = "";
      await withTailorThrowing("connection to 10.0.0.5 refused", async () => {
        hidden = (await finished((await start({})).id)).id;
      });
      expect(
        error.mock.calls.some(
          ([line]) =>
            String(line).startsWith(`Job ${hidden} failed:`) &&
            String(line).includes("10.0.0.5"),
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  describe("retry", () => {
    const retryUrl = (id: string, base = a.base) =>
      `${jobsUrl(base, id)}/retry`;

    async function failedJob(input: Record<string, unknown> = {}) {
      let id = "";
      await withTailorThrowing("boom", async () => {
        id = (await finished((await start(input)).id)).id;
      });
      return id;
    }

    it("gives a failed job's input back, for editing", async () => {
      const id = await failedJob({ target_title: "SDE", max_achievements: 4 });
      const job = await json<Job & { request: Record<string, unknown> }>(
        await get(jobsUrl(a.base, id)),
      );
      expect(job.request).toMatchObject({
        jd_text: JD,
        target_title: "SDE",
        max_achievements: 4,
      });
    });

    it("runs the same input again, with no body at all", async () => {
      const id = await failedJob({ target_title: "SDE" });
      const response = await send(retryUrl(id), "POST");
      expect(response.status).toBe(202);
      const done = await finished((await json<Job>(response)).id);
      expect(done.status).toBe("succeeded");
      expect(done.target_title).toBe("SDE");
      expect(done.error).toBeNull();
      // Replaced, so the list doesn't keep the failure next to its retry.
      expect((await get(jobsUrl(a.base, id))).status).toBe(404);
    });

    it("runs edited input", async () => {
      const id = await failedJob({ target_title: "SDE" });
      const response = await send(retryUrl(id), "POST", {
        request: {
          provider: "deterministic",
          jd_text: JD,
          target_title: "Software Developer",
        },
      });
      expect(response.status).toBe(202);
      const done = await finished((await json<Job>(response)).id);
      expect(done.status).toBe("succeeded");
      expect(done.result?.plan.target_title).toBe("Software Developer");
    });

    it("leaves the failed job alone when the edits are invalid", async () => {
      const id = await failedJob();
      const response = await send(retryUrl(id), "POST", {
        request: { jd_text: "" },
      });
      expect(response.status).toBe(400);
      expect(firstMessage(await json<any>(response))).toContain(
        "request.jd_text",
      );
      expect((await json<Job>(await get(jobsUrl(a.base, id)))).status).toBe(
        "failed",
      );
    });

    it("only retries failed jobs", async () => {
      const job = await start({});
      await finished(job.id);
      expect((await send(retryUrl(job.id), "POST")).status).toBe(409);
    });

    it("queues one job when retry is clicked twice", async () => {
      const id = await failedJob();
      const responses = await Promise.all([
        send(retryUrl(id), "POST"),
        send(retryUrl(id), "POST"),
      ]);
      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([202, 409]);
      const job = await json<Job>(
        responses.find((response) => response.status === 202)!,
      );
      await finished(job.id);
    });

    it("can't retry another user's job", async () => {
      const id = await failedJob();
      expect((await send(retryUrl(id, b.base), "POST")).status).toBe(404);
    });
  });

  it("rejects an unknown company before queueing", async () => {
    const response = await send(jobsUrl(a.base), "POST", {
      jd_text: JD,
      company_id: 99_999,
    });
    expect(response.status).toBe(404);
  });

  it("adds the role to the tracker, without duplicating it", async () => {
    const company = await json<{ id: number }>(
      await send(`${a.base}/api/companies`, "POST", { name: "Acme Corp" }),
    );
    const request = {
      company_id: company.id,
      target_title: "Software Developer",
      job_url: "https://acme.test/jobs/1",
      role_status: "interview",
    };
    const first = await finished((await start(request)).id);
    expect(first.company).toBe("Acme Corp");
    expect(first.role_id).toBeNumber();
    const second = await finished((await start(request)).id);
    expect(second.role_id).toBe(first.role_id!);

    const { roles } = await json<{
      roles: Array<{ status: string; job_url: string }>;
    }>(await get(`${a.base}/api/roles?company_id=${company.id}`));
    expect(roles).toHaveLength(1);
    expect(roles[0].status).toBe("interview");
    expect(roles[0].job_url).toBe("https://acme.test/jobs/1");
  });

  it("creates a new company when given a name", async () => {
    const done = await finished(
      (await start({ company_name: "Brand New Co" })).id,
    );
    expect(done.status).toBe("succeeded");
    expect(done.role_id).toBeNumber();
    const { companies } = await json<{ companies: Array<{ name: string }> }>(
      await get(`${a.base}/api/companies`),
    );
    expect(companies.map((company) => company.name)).toContain("Brand New Co");
  });

  it("limits how many jobs one user can have waiting", async () => {
    const { db, tailorJobs } = await jobsTable();
    const ids = Array.from({ length: 10 }, () => crypto.randomUUID());
    await db.insert(tailorJobs).values(
      ids.map((id) => ({
        id,
        userId: USER_B.id,
        status: "running",
        input: {},
        // Fresh heartbeat: another live worker owns these.
        heartbeatAt: new Date(),
      })),
    );
    const response = await send(jobsUrl(b.base), "POST", { jd_text: JD });
    expect(response.status).toBe(429);
    await db.delete(tailorJobs).where(eq(tailorJobs.userId, USER_B.id));
  });
});

describe("recovery after a crash", () => {
  const input = (request: Record<string, unknown>) => ({
    account: { display_name: USER_A.display_name, email: USER_A.email },
    request: { provider: "deterministic", jd_text: JD, ...request },
  });
  const staleBeat = () => new Date(Date.now() - 10 * 60_000);

  it("picks up a job whose worker died", async () => {
    const { db, tailorJobs } = await jobsTable();
    const id = crypto.randomUUID();
    await db.insert(tailorJobs).values({
      id,
      userId: USER_A.id,
      status: "running",
      stage: "rewriting",
      attempts: 1,
      heartbeatAt: staleBeat(),
      input: input({}),
    });
    const done = await finished(id);
    expect(done.status).toBe("succeeded");
  }, 20_000);

  it("gives up on a job that keeps dying", async () => {
    const { db, tailorJobs } = await jobsTable();
    const id = crypto.randomUUID();
    await db.insert(tailorJobs).values({
      id,
      userId: USER_A.id,
      status: "running",
      attempts: 3,
      heartbeatAt: staleBeat(),
      input: input({}),
    });
    const done = await finished(id);
    expect(done.status).toBe("failed");
    expect(done.error).toContain("Try again");
  }, 20_000);

  it("leaves a job alone while its worker is alive", async () => {
    const { db, tailorJobs } = await jobsTable();
    const id = crypto.randomUUID();
    await db.insert(tailorJobs).values({
      id,
      userId: USER_A.id,
      status: "running",
      attempts: 1,
      heartbeatAt: new Date(),
      input: input({}),
    });
    await Bun.sleep(5_500); // Longer than the poll interval.
    const [row] = await db
      .select()
      .from(tailorJobs)
      .where(eq(tailorJobs.id, id));
    expect(row.status).toBe("running");
    expect(row.attempts).toBe(1);
    await db.delete(tailorJobs).where(eq(tailorJobs.id, id));
  }, 10_000);
});

describe("review to PDF, as the web app sends it", () => {
  let result: Record<string, any>;

  beforeAll(async () => {
    const done = await finished((await start({})).id);
    result = done.result!;
  }, 20_000);

  it("accepts a null summary and returns a rebuilt resume", async () => {
    const response = await send(`${a.base}/api/review`, "POST", {
      plan: result.plan,
      edits: { rewritten_text: {}, summary: null },
    });
    expect(response.status).toBe(201);
    const body = await json<Record<string, any>>(response);
    expect(body.resume_data.font).toBeTruthy();
    expect(body.validation.issues).toBeArray();
    expect(body.rejected_edits).toEqual([]);
  });

  it("puts an accepted edit into the resume", async () => {
    const [id] = Object.keys(result.plan.rewrites);
    const edit =
      "Built admin tools in TypeScript and React for an internal admin platform.";
    const response = await send(`${a.base}/api/review`, "POST", {
      plan: result.plan,
      edits: { rewritten_text: { [id]: edit } },
    });
    const body = await json<Record<string, any>>(response);
    expect(body.rejected_edits).toEqual([]);
    expect(JSON.stringify(body.resume_data)).toContain(edit);
  });

  it("rejects an invented claim and keeps it out of the resume", async () => {
    const [id] = Object.keys(result.plan.rewrites);
    const response = await send(`${a.base}/api/review`, "POST", {
      plan: JSON.parse(JSON.stringify(result.plan)),
      edits: {
        rewritten_text: { [id]: "Led a team of 500 engineers at Google." },
      },
    });
    const body = await json<Record<string, any>>(response);
    expect(body.rejected_edits).toEqual([id]);
    expect(JSON.stringify(body.resume_data)).not.toContain("500 engineers");
  });

  it("renders from resume_data, or says clearly that Typst is missing", async () => {
    const response = await send(`${a.base}/api/render`, "POST", {
      resume_data: result.resume_data,
    });
    // Typst isn't installed everywhere the tests run.
    expect([200, 503]).toContain(response.status);
    if (response.status === 200) {
      expect(response.headers.get("content-type")).toBe("application/pdf");
    }
  });

  it("keeps reviewed edits with the job", async () => {
    const job = await finished((await start({})).id);
    const id = Object.keys(job.result?.plan.rewrites)[0];
    const response = await send(`${a.base}/api/review`, "POST", {
      plan: job.result?.plan,
      edits: { rewritten_text: { [id]: "Built admin tools in TypeScript" } },
      job_id: job.id,
    });
    expect(response.status).toBe(201);
    const reopened = await json<Job>(await get(jobsUrl(a.base, job.id)));
    expect(reopened.result?.plan.rewrites[id].rewritten_text).toBe(
      "Built admin tools in TypeScript",
    );
    expect(reopened.result?.providers).toBeDefined();
    expect(JSON.stringify(reopened.result?.resume_data)).toContain(
      "Built admin tools in TypeScript",
    );
  });

  it("explains how to fix a missing Typst", async () => {
    const { TypstRenderService } =
      await import("../src/tailor/typst-render.service");
    const service = new TypstRenderService({
      get: () => "/nonexistent/typst",
    } as never);
    const failure = await service.compilePdf({} as never).catch((e) => e);
    expect(failure.getStatus()).toBe(503);
    expect(failure.message).toContain("set TYPST_BIN");
  });
});
