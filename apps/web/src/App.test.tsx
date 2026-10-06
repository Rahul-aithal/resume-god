// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as api from "./lib/api";

vi.mock("./lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    fetchMe: vi.fn(),
    fetchDashboard: vi.fn(),
    logout: vi.fn(),
  };
});

afterEach(cleanup);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderApp(route = "/") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.mocked(api.fetchMe).mockReset();
    queryClient.clear();
  });

  it("renders a nav link", () => {
    vi.mocked(api.fetchMe).mockRejectedValue(
      new api.ApiError(401, "Login required"),
    );
    renderApp();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeDefined();
  });

  it("redirects anonymous users from protected routes to login", async () => {
    vi.mocked(api.fetchMe).mockRejectedValue(
      new api.ApiError(401, "Login required"),
    );
    renderApp("/companies");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Log in" })).toBeDefined();
    });
    expect(screen.getByText("Continue with Google")).toBeDefined();
  });

  it("shows the signed-in header and dashboard for logged-in users", async () => {
    vi.mocked(api.fetchMe).mockResolvedValue({
      id: 1,
      email: "tester@example.com",
      display_name: "Tester",
    });
    vi.mocked(api.fetchDashboard).mockResolvedValue({
      company_count: 2,
      role_count: 3,
      by_status: { applied: 2, interview: 1 },
      recent_roles: [],
      recent_artifacts: [],
    });
    renderApp("/");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeDefined();
    });
    expect(screen.getByText("Log out")).toBeDefined();
    expect(screen.getByRole("link", { name: "Companies" })).toBeDefined();
  });
});
