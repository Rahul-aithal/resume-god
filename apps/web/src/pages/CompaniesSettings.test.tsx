// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import CompaniesPage from "./CompaniesPage";
import SettingsPage from "./SettingsPage";

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    fetchCompanies: vi.fn(),
    createCompany: vi.fn(),
    fetchSettings: vi.fn(),
    fetchProviders: vi.fn(),
    updateSettings: vi.fn(),
  };
});

afterEach(cleanup);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CompaniesPage", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.mocked(api.fetchCompanies).mockResolvedValue({
      companies: [
        {
          id: 1,
          name: "Goodspace",
          website: "https://goodspace.example",
          location: "Noida",
          about: "AI hiring products",
          notes: "",
          role_count: 2,
          created_at: null,
          updated_at: null,
        },
      ],
    });
    vi.mocked(api.createCompany).mockResolvedValue({
      id: 2,
      name: "Rox",
      website: "",
      location: "",
      about: "",
      notes: "",
      role_count: 0,
      created_at: null,
      updated_at: null,
    });
  });

  it("lists companies from the API", async () => {
    renderWithProviders(<CompaniesPage />);
    await waitFor(() => {
      expect(screen.getByText("Goodspace")).toBeDefined();
    });
    expect(screen.getByText("2 roles")).toBeDefined();
  });

  it("creates a company through the form", async () => {
    renderWithProviders(<CompaniesPage />);
    await waitFor(() => {
      expect(screen.getByText("Goodspace")).toBeDefined();
    });
    fireEvent.change(
      screen.getByPlaceholderText("Company name (e.g. Goodspace)"),
      {
        target: { value: "Rox" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));
    await waitFor(() => {
      expect(api.createCompany).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Rox" }),
      );
    });
  });
});

describe("SettingsPage", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.mocked(api.fetchSettings).mockResolvedValue({
      llm_order: "gemini,glm",
      gemini_model: "gemini-3-flash-preview",
      glm_model: "glm-4.6",
      default_font: "Calibri",
    });
    vi.mocked(api.fetchProviders).mockResolvedValue({
      order: ["gemini", "glm"],
      auto: "gemini (auto)",
      models: { gemini: "gemini-3-flash-preview", glm: "glm-4.6" },
      default_font: "Calibri",
    });
    vi.mocked(api.updateSettings).mockResolvedValue({
      llm_order: "glm,gemini",
      gemini_model: "gemini-3-flash-preview",
      glm_model: "glm-4.6",
      default_font: "Times New Roman",
    });
  });

  it("loads current settings into the form", async () => {
    renderWithProviders(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("gemini-3-flash-preview")).toBeDefined();
    });
    expect(screen.getByDisplayValue("Calibri")).toBeDefined();
  });

  it("saves edited settings", async () => {
    renderWithProviders(<SettingsPage />);
    const fontInput = await screen.findByDisplayValue("Calibri");
    fireEvent.change(fontInput, { target: { value: "Times New Roman" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ default_font: "Times New Roman" }),
      );
    });
    expect(await screen.findByText("Settings saved.")).toBeDefined();
  });
});
