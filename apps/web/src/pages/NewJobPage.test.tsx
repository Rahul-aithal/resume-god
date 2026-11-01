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
import NewJobPage from "./NewJobPage";

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    fetchCompanies: vi.fn(),
    fetchSettings: vi.fn(),
    postTailor: vi.fn(),
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
    vi.mocked(api.postTailor).mockReset();
    queryClient.clear();
  });

  it("shows a friendly alert when the API rejects the run", async () => {
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
    vi.mocked(api.postTailor).mockRejectedValue(
      new api.ApiError(
        422,
        "API 422: Target title does not match the job description: you requested 'Platform Engineer', but the job description reads as 'Data Scientist'.",
      ),
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
    fireEvent.click(
      screen.getByRole("button", { name: /generate tailored plan/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
    expect(screen.getByText("Could not generate the plan")).toBeDefined();
    expect(screen.getByText(/requested 'Platform Engineer'/)).toBeDefined();
    expect(screen.getByText(/reads as 'Data Scientist'/)).toBeDefined();
  });
});
