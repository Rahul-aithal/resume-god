// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphNode, GraphProjection } from "@resume-god/api-client";
import GraphTable from "./GraphTable";

const nodes: GraphNode[] = [
  ...Array.from({ length: 30 }, (_, index) => ({
    id: `skill_${index + 1}`,
    kind: "skill" as const,
    label: `Skill ${index + 1}`,
    detail: index % 2 ? "Frontend" : "Backend",
  })),
  { id: "exp", kind: "experience", label: "Acme", detail: "Engineer" },
];

const projection: GraphProjection = {
  reviewed_at: null,
  nodes,
  edges: [
    { from: "exp", to: "skill_2", type: "USES" },
    { from: "exp", to: "skill_3", type: "USES" },
  ],
  stats: {
    skills: 30,
    parents: 1,
    achievements: 0,
    education: 0,
    certifications: 0,
    edges: 2,
  },
};

function names() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector("td:nth-child(2)")?.textContent);
}

async function pick(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  const item = await screen.findByRole("option", { name: option });
  fireEvent.pointerDown(item);
  fireEvent.click(item);
}

function renderTable(onOpen = vi.fn()) {
  render(<GraphTable projection={projection} onOpen={onOpen} />);
  return onOpen;
}

describe("GraphTable", () => {
  afterEach(cleanup);

  it("paginates, and disables buttons at each end", () => {
    renderTable();
    expect(names()).toHaveLength(25);
    expect(screen.getByText("Showing 1–25 of 31")).toBeDefined();
    const previous = screen.getByRole("button", {
      name: "Previous page",
    }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(names()).toHaveLength(6);
    expect(screen.getByText("Showing 26–31 of 31")).toBeDefined();
    expect(screen.getByText("Page 2 of 2")).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Last page" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("changes the page size and returns to the first page", async () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await pick("Rows per page", "10 per page");
    expect(names()).toHaveLength(10);
    expect(screen.getByText("Page 1 of 4")).toBeDefined();
  });

  it("sorts naturally, then reversed, then back to the original order", () => {
    renderTable();
    const name = () => screen.getByRole("button", { name: "Name" });
    const header = () => name().closest("th")!;

    fireEvent.click(name());
    expect(header().getAttribute("aria-sort")).toBe("ascending");
    // Natural order: Skill 2 sorts before Skill 10.
    expect(names().slice(0, 3)).toEqual(["Acme", "Skill 1", "Skill 2"]);

    fireEvent.click(name());
    expect(header().getAttribute("aria-sort")).toBe("descending");
    expect(names()[0]).toBe("Skill 30");

    fireEvent.click(name());
    expect(header().getAttribute("aria-sort")).toBe("none");
    expect(names()[0]).toBe("Skill 1");
  });

  it("sorts links largest first and breaks ties by name", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Links" }));
    expect(names().slice(0, 4)).toEqual([
      "Acme",
      "Skill 2",
      "Skill 3",
      "Skill 1",
    ]);
  });

  it("combines filters, resets the page, and clears them", async () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    await pick("Filter by kind", "Skill (30)");
    expect(screen.getByText("Page 1 of 2")).toBeDefined();
    expect(screen.getByText(/filtered from 31/)).toBeDefined();

    await pick("Filter by links", "Has links");
    expect(names()).toEqual(["Skill 2", "Skill 3"]);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search the graph" }),
      {
        target: { value: "backend" },
      },
    );
    expect(names()).toEqual(["Skill 3"]);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search the graph" }),
      {
        target: { value: "nothing like this" },
      },
    );
    expect(screen.getByText("Nothing matches these filters.")).toBeDefined();
    expect(screen.getByText(/No results/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Showing 1–25 of 31")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("stays on a real page when the data shrinks", () => {
    const { rerender } = render(
      <GraphTable projection={projection} onOpen={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    rerender(
      <GraphTable
        projection={{ ...projection, nodes: nodes.slice(0, 5) }}
        onOpen={vi.fn()}
      />,
    );
    expect(names()).toHaveLength(5);
    expect(screen.getByText("Page 1 of 1")).toBeDefined();
  });

  it("opens a node from its row", () => {
    const onOpen = renderTable();
    fireEvent.click(screen.getByText("Skill 4"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe("skill_4");
  });
});
