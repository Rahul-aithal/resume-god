// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import GraphPage from "./GraphPage";

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    fetchGraph: vi.fn(),
    fetchGraphSkill: vi.fn(),
    fetchGraphAchievement: vi.fn(),
    updateGraphSkill: vi.fn(),
    reviewGraph: vi.fn(),
  };
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const PROJECTION = {
  reviewed_at: null,
  nodes: [
    { id: "skill_ts", kind: "skill", label: "TypeScript", detail: "Languages" },
    {
      id: "achievement_1",
      kind: "achievement",
      label: "Built admin UIs",
      detail: "XParth",
    },
  ],
  edges: [{ from: "achievement_1", to: "skill_ts", type: "DEMONSTRATES" }],
  stats: {
    skills: 1,
    parents: 0,
    achievements: 1,
    education: 0,
    certifications: 0,
    edges: 1,
  },
};

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <GraphPage />
    </QueryClientProvider>,
  );
}

describe("GraphPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    queryClient.clear();
    vi.mocked(api.fetchGraph).mockReset();
    vi.mocked(api.fetchGraphSkill).mockReset();
    vi.mocked(api.fetchGraphAchievement).mockReset();
    vi.mocked(api.updateGraphSkill).mockReset();
    vi.mocked(api.reviewGraph).mockReset();
    vi.mocked(api.fetchGraph).mockResolvedValue(PROJECTION as never);
  });

  it("renders nodes, counts, and unreviewed state", async () => {
    renderPage();
    expect(await screen.findByText("Knowledge graph")).toBeDefined();
    expect(await screen.findByText(/1 skills/)).toBeDefined();
    expect(await screen.findByText("Mark reviewed")).toBeDefined();
  });

  it("opens the inspector and saves aliases", async () => {
    vi.mocked(api.fetchGraphSkill).mockResolvedValue({
      id: "skill_ts",
      name: "TypeScript",
      category: "Languages",
      aliases: ["TS"],
    });
    vi.mocked(api.updateGraphSkill).mockResolvedValue({
      id: "skill_ts",
      name: "TypeScript",
      category: "Languages",
      aliases: ["TS", "Type Script"],
    });
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Graph" }));
    await waitFor(() => {
      expect(
        screen
          .getAllByText("TypeScript")
          .some((element) => element.closest(".react-flow__node")),
      ).toBe(true);
    });
    const node = screen
      .getAllByText("TypeScript")
      .find((element) => element.closest(".react-flow__node"));
    fireEvent.click(node!);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("JS, Javascript")).toBeDefined();
    });
    expect(
      (screen.getByPlaceholderText("JS, Javascript") as HTMLInputElement).value,
    ).toBe("TS");
    fireEvent.change(screen.getByPlaceholderText("JS, Javascript"), {
      target: { value: "TS, Type Script" },
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(api.updateGraphSkill).toHaveBeenCalledWith("skill_ts", {
        name: "TypeScript",
        category: "Languages",
        aliases: ["TS", "Type Script"],
      });
    });
  });

  it("edits the import document in the expanded editor", async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Expand editor" }),
    );
    const expanded = await screen.findByRole("textbox", {
      name: "Profile document, expanded",
    });
    fireEvent.change(expanded, { target: { value: "skills: []" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Profile document, expanded" }),
      ).toBeNull();
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: "Profile document",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("skills: []");
  });

  it("lists nodes in the table tab and opens the inspector from a row", async () => {
    vi.mocked(api.fetchGraphSkill).mockResolvedValue({
      id: "skill_ts",
      name: "TypeScript",
      category: "Languages",
      aliases: ["TS"],
    });
    renderPage();
    await screen.findByText(/1 skills/);
    const search = await screen.findByRole("textbox", {
      name: "Search the graph",
    });
    fireEvent.change(search, { target: { value: "admin" } });
    expect(screen.queryByRole("button", { name: "TypeScript" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Built admin UIs" }),
    ).toBeDefined();
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "TypeScript" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("JS, Javascript")).toBeDefined();
    });
  });

  it("opens on the table and loads the graph only when asked", async () => {
    renderPage();
    await screen.findByText(/1 skills/);
    expect(
      screen.getByRole("tab", { name: "Table" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.querySelector(".react-flow")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Graph" }));
    await waitFor(() => {
      expect(document.querySelector(".react-flow")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    await waitFor(() => {
      expect(document.querySelector(".react-flow")).toBeNull();
    });
  });

  it("toggles fullscreen, filling the window if the browser refuses", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Graph" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Enter fullscreen" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Exit fullscreen" }),
    );
    await screen.findByRole("button", { name: "Enter fullscreen" });
  });

  it("marks the graph reviewed", async () => {
    vi.mocked(api.reviewGraph).mockResolvedValue({
      reviewed: true,
      reviewed_at: "2026-10-13T00:00:00.000Z",
    });
    renderPage();
    fireEvent.click(await screen.findByText("Mark reviewed"));
    await waitFor(() => {
      expect(api.reviewGraph).toHaveBeenCalled();
    });
  });
});
