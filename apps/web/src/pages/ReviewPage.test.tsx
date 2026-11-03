// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { setSessionPlan } from "../lib/session";
import ReviewPage from "./ReviewPage";

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    postRender: vi.fn(),
    postRenderDocx: vi.fn(),
    postReview: vi.fn(),
    fetchGraphAchievement: vi.fn(),
    updateGraphAchievement: vi.fn(),
  };
});

const plan = {
  rewrites: {
    ach_a: {
      source_text: "Built tools.",
      rewritten_text: "Built tools.",
      used_rewrite: false,
      status: "fallback_original",
    },
    ach_b: {
      source_text: "Shipped 8 releases.",
      rewritten_text: "Shipped 8 releases.",
      used_rewrite: true,
      status: "used",
    },
  },
};
const resume = { summary: "Summary", font: "Calibri", target_title: "Dev" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>,
  );
}

const reviewResult = (patch = {}) => ({
  plan,
  rejected_edits: [],
  resume_data: { ...resume },
  validation: { dropped_bullets: [], fallback_bullets: [], issues: [] },
  ...patch,
});

describe("ReviewPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(api.postRender).mockReset();
    vi.mocked(api.postRenderDocx).mockReset();
    vi.mocked(api.postReview).mockReset();
    vi.mocked(api.fetchGraphAchievement).mockReset();
    vi.mocked(api.updateGraphAchievement).mockReset();
    URL.createObjectURL = vi.fn(() => "blob:pdf");
    URL.revokeObjectURL = vi.fn();
    setSessionPlan(plan, undefined, { resumeData: resume, jobId: "job-1" });
  });

  it("shows PDF progress only where the PDF is being built", async () => {
    const pending = deferred<Blob>();
    vi.mocked(api.postRender).mockReturnValue(pending.promise);
    renderPage();
    expect(await screen.findByText("Building your PDF…")).toBeDefined();
    expect(screen.getByRole("button", { name: "Building PDF…" })).toBeDefined();
    // Nothing else claims to be working, though it can't be pressed meanwhile.
    const word = screen.getByRole("button", {
      name: "Download Word",
    }) as HTMLButtonElement;
    expect(word.disabled).toBe(true);
    expect(word.querySelector(".animate-spin")).toBeNull();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();

    pending.resolve(new Blob(["pdf"]));
    await screen.findByRole("button", { name: "Download PDF" });
    expect(screen.queryByText("Building your PDF…")).toBeNull();
    expect(screen.getByTitle("Rendered resume PDF")).toBeDefined();
  });

  it("says when the PDF is out of date", async () => {
    vi.mocked(api.postRender).mockResolvedValue(new Blob(["pdf"]));
    renderPage();
    await screen.findByRole("button", { name: "Download PDF" });
    fireEvent.change(screen.getAllByLabelText("Resume text")[0], {
      target: { value: "Edited" },
    });
    expect(screen.getByText(/changes since this PDF/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  });

  it("explains a failed build instead of spinning", async () => {
    vi.mocked(api.postRender).mockRejectedValue(new Error("Typst is missing"));
    renderPage();
    expect(await screen.findByText("Typst is missing")).toBeDefined();
    expect(screen.getByText("The PDF wasn't built.")).toBeDefined();
    expect(screen.queryByText("Building your PDF…")).toBeNull();
  });

  it("flags points with no number and counts the rest", async () => {
    vi.mocked(api.postRender).mockResolvedValue(new Blob(["pdf"]));
    renderPage();
    await screen.findByRole("button", { name: "Download PDF" });
    expect(screen.getByText("1 of 2 points have a number.")).toBeDefined();
    expect(screen.getAllByText("No number")).toHaveLength(1);
  });

  it("saves an added number as a fact, then puts it in the bullet", async () => {
    vi.mocked(api.postRender).mockResolvedValue(new Blob(["pdf"]));
    vi.mocked(api.fetchGraphAchievement).mockResolvedValue({
      metrics: ["3 tools"],
    } as never);
    vi.mocked(api.updateGraphAchievement).mockResolvedValue({} as never);
    vi.mocked(api.postReview).mockResolvedValue(reviewResult() as never);
    renderPage();
    await screen.findByRole("button", { name: "Download PDF" });
    fireEvent.change(screen.getByLabelText("Add a number to ach_a"), {
      target: { value: "500 users" },
    });
    fireEvent.submit(
      screen.getByLabelText("Add a number to ach_a").closest("form")!,
    );
    await waitFor(() => expect(api.postReview).toHaveBeenCalled());
    expect(api.updateGraphAchievement).toHaveBeenCalledWith("ach_a", {
      metrics: ["3 tools", "500 users"],
    });
    expect(vi.mocked(api.postReview).mock.calls[0][1]).toEqual({
      ach_a: "Built tools; 500 users.",
    });
    expect(vi.mocked(api.postReview).mock.calls[0][4]).toBe("job-1");
  });

  it("builds the PDF from edits, not the older resume", async () => {
    vi.mocked(api.postRender).mockResolvedValue(new Blob(["pdf"]));
    const edited = { ...resume, summary: "Edited summary" };
    vi.mocked(api.postReview).mockResolvedValue(
      reviewResult({ resume_data: edited }) as never,
    );
    renderPage();
    await screen.findByRole("button", { name: "Download PDF" });
    fireEvent.change(screen.getAllByLabelText("Resume text")[0], {
      target: { value: "Edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rebuild PDF" }));
    await waitFor(() => expect(api.postRender).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.postRender).mock.calls[1][0]).toEqual(edited);
  });
});
