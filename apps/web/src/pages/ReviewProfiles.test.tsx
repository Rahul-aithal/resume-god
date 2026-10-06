// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import ProfilesPage from "./ProfilesPage";
import ReviewPage from "./ReviewPage";
import { clearSessionPlan, setSessionPlan } from "../lib/session";

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    fetchProfiles: vi.fn(),
  };
});

afterEach(cleanup);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement, route = "/") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const PLAN = {
  target_title: "Software Engineer",
  requirement_coverage: [
    { name: "Python", status: "covered" },
    { name: "Go", status: "missing" },
  ],
  rewrites: {
    ach_1: {
      source_text: "Built a pipeline.",
      rewritten_text: "Built a fast pipeline.",
      used_rewrite: true,
      status: "grounded",
    },
  },
};

describe("ReviewPage", () => {
  beforeEach(() => {
    queryClient.clear();
    clearSessionPlan();
  });

  it("shows the empty state without a plan", () => {
    renderWithProviders(<ReviewPage />);
    expect(screen.getByText(/No plan loaded\./)).toBeDefined();
  });

  it("shows source vs AI wording side by side", () => {
    setSessionPlan(PLAN as never);
    renderWithProviders(<ReviewPage />);
    expect(screen.getByText("Built a pipeline.")).toBeDefined();
    expect(screen.getByText(/Built a fast pipeline\./)).toBeDefined();
    expect(screen.getByText(/AI rewrite used/)).toBeDefined();
    expect(screen.getByText("Coverage")).toBeDefined();
  });
});

describe("ProfilesPage", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.mocked(api.fetchProfiles).mockResolvedValue({
      versions: [
        {
          version: 2,
          status: "user_reviewed",
          is_active: true,
          created_at: "2026-10-04T10:00:00",
        },
        {
          version: 1,
          status: "draft",
          is_active: false,
          created_at: "2026-10-01T10:00:00",
        },
      ],
      has_active: true,
      active_status: "user_reviewed",
    });
  });

  it("lists profile versions with active badge", async () => {
    renderWithProviders(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("v2")).toBeDefined();
    });
    expect(screen.getByText("active")).toBeDefined();
    expect(screen.getByText("draft")).toBeDefined();
  });
});
