import { describe, expect, it } from "vitest";
import { API_PREFIX, type JobSummary } from "./index";

describe("api-client", () => {
  it("uses the /api prefix for all backend routes", () => {
    expect(API_PREFIX).toBe("/api");
  });

  it("accepts a well-shaped JobSummary", () => {
    const job: JobSummary = {
      id: "job-1",
      company: "Acme",
      targetTitle: "Backend Engineer",
      status: "draft",
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(job.company).toBe("Acme");
  });
});
