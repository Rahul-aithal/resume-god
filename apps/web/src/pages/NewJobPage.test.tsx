// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import NewJobPage from "./NewJobPage";

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    fetchCompanies: vi.fn(),
    fetchSettings: vi.fn(),
    createTailorJob: vi.fn(),
  };
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/jobs/new"]}>
        <NewJobPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NewJobPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(api.fetchCompanies).mockReset();
    vi.mocked(api.fetchSettings).mockReset();
    vi.mocked(api.createTailorJob).mockReset();
    queryClient.clear();
  });

  it("shows a friendly alert when the API rejects the job", async () => {
    vi.mocked(api.fetchCompanies).mockResolvedValue({
      companies: [
        {
          id: 1,
          name: "Goodspace",
          website: "",
          location: "",
          about: "",
          notes: "",
          role_count: 0,
          created_at: null,
          updated_at: null,
        },
      ],
    });
    vi.mocked(api.fetchSettings).mockResolvedValue({
      llm_order: "gemini,glm",
      gemini_model: "gemini-3-flash-preview",
      glm_model: "glm-4.6",
      openai_model: "gpt-4.1",
      default_font: "Calibri",
    });
    vi.mocked(api.createTailorJob).mockRejectedValue(
      new api.ApiError(429, "You already have 10 jobs in progress."),
    );

    renderPage();

    await waitFor(() => expect(api.fetchCompanies).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("combobox", { name: /company/i }));
    // Base UI only commits a mouse click that began on the item.
    const option = await screen.findByRole("option", { name: "Goodspace" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    fireEvent.change(screen.getByRole("textbox", { name: /target title/i }), {
      target: { value: "Platform Engineer" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: /job description/i }),
      {
        target: { value: "We need Python and FastAPI engineers." },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /start tailoring/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
    expect(screen.getByText("Could not start tailoring")).toBeDefined();
    expect(screen.getByText(/10 jobs in progress/)).toBeDefined();
  });

  it("sends the application to the background with its company", async () => {
    vi.mocked(api.fetchCompanies).mockResolvedValue({
      companies: [
        {
          id: 1,
          name: "Goodspace",
          website: "",
          location: "",
          about: "",
          notes: "",
          role_count: 0,
          created_at: null,
          updated_at: null,
        },
      ],
    });
    vi.mocked(api.fetchSettings).mockResolvedValue({
      llm_order: "gemini",
      gemini_model: "g",
      glm_model: "g",
      openai_model: "o",
      default_font: "Calibri",
    });
    vi.mocked(api.createTailorJob).mockResolvedValue({ id: "job" } as never);
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/jobs/new?companyId=1"]}>
          <Routes>
            <Route path="/jobs/new" element={<NewJobPage />} />
            <Route path="/tailoring" element={<h1>Jobs list</h1>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: /job description/i }),
      { target: { value: "We need TypeScript." } },
    );
    fireEvent.click(screen.getByRole("button", { name: /start tailoring/i }));
    await screen.findByRole("heading", { name: "Jobs list" });
    expect(api.createTailorJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jd_text: "We need TypeScript.",
        company_id: 1,
        role_status: "applied",
      }),
    );
  });
});
