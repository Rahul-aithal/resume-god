// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TailorJob } from "@resume-god/api-client";
import * as api from "../lib/api";
import { getSessionPlan } from "../lib/session";
import TailoringPage from "./TailoringPage";

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    fetchTailorJobs: vi.fn(),
    fetchTailorJob: vi.fn(),
    retryTailorJob: vi.fn(),
  };
});

const job = (patch: Partial<TailorJob>): TailorJob => ({
  id: "job-1",
  status: "running",
  stage: "rewriting",
  target_title: "Frontend Engineer",
  company: "Acme",
  role_id: null,
  error: null,
  warning: null,
  created_at: "2026-11-01T10:00:00.000Z",
  started_at: null,
  finished_at: null,
  ...patch,
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tailoring"]}>
        <Routes>
          <Route path="/tailoring" element={<TailoringPage />} />
          <Route path="/review" element={<h1>Review page</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TailoringPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(api.fetchTailorJobs).mockReset();
    vi.mocked(api.fetchTailorJob).mockReset();
    vi.mocked(api.retryTailorJob).mockReset();
  });

  it("separates running jobs from finished ones", async () => {
    vi.mocked(api.fetchTailorJobs).mockResolvedValue({
      jobs: [
        job({ id: "a" }),
        job({ id: "b", status: "queued", stage: null, target_title: "Next" }),
        job({
          id: "c",
          status: "failed",
          stage: null,
          target_title: "Broken",
          error: "Target title does not match",
        }),
      ],
    });
    renderPage();
    const active = await screen.findByRole("region", { name: "In progress" });
    expect(within(active).getByText("Rewriting bullet points")).toBeDefined();
    expect(within(active).getByText("Waiting to start")).toBeDefined();
    const done = screen.getByRole("region", { name: "Finished" });
    expect(within(done).getByText("Target title does not match")).toBeDefined();
  });

  it("picks up a job finishing, then stops polling", async () => {
    vi.mocked(api.fetchTailorJobs)
      .mockResolvedValueOnce({ jobs: [job({})] })
      .mockResolvedValue({
        jobs: [job({ status: "succeeded", stage: null })],
      });
    renderPage();
    await screen.findByText("Rewriting bullet points");
    await screen.findByRole("button", { name: "Review" }, { timeout: 4_000 });
    const calls = vi.mocked(api.fetchTailorJobs).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    expect(vi.mocked(api.fetchTailorJobs).mock.calls.length).toBe(calls);
  }, 10_000);

  it("opens a finished job in review, with its resume", async () => {
    vi.mocked(api.fetchTailorJobs).mockResolvedValue({
      jobs: [job({ status: "succeeded", stage: null })],
    });
    vi.mocked(api.fetchTailorJob).mockResolvedValue({
      ...job({ status: "succeeded", stage: null }),
      request: { jd_text: "We need TypeScript." },
      result: {
        plan: { target_title: "Frontend Engineer" },
        resume_data: { font: "Calibri" },
        validation: { dropped_bullets: [], fallback_bullets: [], issues: [] },
        providers: {},
      },
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await screen.findByRole("heading", { name: "Review page" });
    await waitFor(() => {
      expect(getSessionPlan()?.resumeData).toEqual({ font: "Calibri" });
    });
  });

  it("retries a failed job, and links to editing it first", async () => {
    const failed = job({ status: "failed", stage: null, error: "Boom" });
    vi.mocked(api.fetchTailorJobs)
      .mockResolvedValueOnce({ jobs: [failed] })
      .mockResolvedValue({ jobs: [job({ id: "job-2" })] });
    vi.mocked(api.retryTailorJob).mockResolvedValue(job({ id: "job-2" }));
    renderPage();
    const edit = await screen.findByRole("link", { name: "Edit and retry" });
    expect(edit.getAttribute("href")).toBe("/jobs/new?retry=job-1");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Rewriting bullet points");
    expect(vi.mocked(api.retryTailorJob).mock.calls[0]).toEqual(["job-1"]);
    expect(screen.queryByText("Boom")).toBeNull();
  });

  it("explains a retry that didn't start", async () => {
    vi.mocked(api.fetchTailorJobs).mockResolvedValue({
      jobs: [job({ status: "failed", stage: null, error: "Boom" })],
    });
    vi.mocked(api.retryTailorJob).mockRejectedValue(
      new api.ApiError(404, "Company not found"),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/Company not found/)).toBeDefined();
  });

  it("offers no retry on a job that didn't fail", async () => {
    vi.mocked(api.fetchTailorJobs).mockResolvedValue({
      jobs: [job({ status: "succeeded", stage: null })],
    });
    renderPage();
    await screen.findByRole("button", { name: "Review" });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("explains what to do when there are no jobs", async () => {
    vi.mocked(api.fetchTailorJobs).mockResolvedValue({ jobs: [] });
    renderPage();
    expect(await screen.findByText("Nothing tailoring yet")).toBeDefined();
  });
});
