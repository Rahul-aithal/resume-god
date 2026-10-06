// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import LoginPage from "./LoginPage";

vi.mock("../lib/api", () => ({
  fetchAuthProviders: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: false,
    isLoading: false,
    userId: null,
  })),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(api.fetchAuthProviders).mockReset();
    queryClient.clear();
  });

  it("links to Google and shows the exact redirect URI when configured", async () => {
    vi.mocked(api.fetchAuthProviders).mockResolvedValue({
      google: { configured: true, login_path: "/api/auth/login/google" },
      redirect_uri: "http://localhost:8080/api/auth/callback/google",
      base_url_source: "request",
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("http://localhost:8080/api/auth/callback/google"),
      ).toBeDefined();
    });
    expect(
      screen
        .getByRole("link", { name: "Continue with Google" })
        .getAttribute("href"),
    ).toBe("/api/auth/login/google");
    expect(
      screen.getByText("http://localhost:8080/api/auth/callback/google"),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDefined();
  });

  it("shows setup help and a disabled button when OAuth is unconfigured", async () => {
    vi.mocked(api.fetchAuthProviders).mockResolvedValue({
      google: { configured: false, login_path: "/api/auth/login/google" },
      redirect_uri: "http://localhost:5173/api/auth/callback/google",
      base_url_source: "request",
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("Google login is not configured yet"),
      ).toBeDefined();
    });
    const button = screen.getByRole("button", {
      name: "Continue with Google",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("GOOGLE_CLIENT_ID")).toBeDefined();
    expect(
      screen.getByText("http://localhost:5173/api/auth/callback/google"),
    ).toBeDefined();
  });
});
