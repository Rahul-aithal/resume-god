import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";

import type {
  GraphEdgeType,
  GraphNode as GraphNodeData,
  GraphProjection,
} from "@resume-god/api-client";
import {
  deleteGraphAchievement,
  deleteGraphParent,
  deleteGraphSkill,
  exportGraph,
  fetchGraph,
  fetchGraphAchievement,
  fetchGraphSkill,
  importGraph,
  reviewGraph,
  unreviewGraph,
  updateGraphAchievement,
  updateGraphParent,
  updateGraphSkill,
} from "../lib/api";

const KIND_COLOR: Record<string, string> = {
  skill: "#4f46e5",
  experience: "#0891b2",
  project: "#0d9488",
  achievement: "#ca8a04",
  education: "#9333ea",
  certification: "#db2777",
};

const EDGE_COLOR: Record<GraphEdgeType, string> = {
  USES: "#0891b2",
  PART_OF: "#94a3b8",
  DEMONSTRATES: "#ca8a04",
  IMPLIES: "#4f46e5",
};

function toFlowData(projection: GraphProjection): {
  nodes: Node[];
  edges: Edge[];
} {
  const counts = new Map<string, number>();
  const grid = (kind: string, index: number) => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    const column = Object.keys(KIND_COLOR).indexOf(kind);
    return { x: column * 280, y: (counts.get(kind)! - 1) * 90 };
  };
  const nodes: Node[] = projection.nodes.map((node: GraphNodeData, index) => ({
    id: node.id,
    position: grid(node.kind, index),
    data: { label: node.label, kind: node.kind, detail: node.detail },
    style: {
      background: "#fff",
      border: `2px solid ${KIND_COLOR[node.kind] ?? "#64748b"}`,
      borderRadius: 8,
      padding: 6,
      fontSize: 11,
      width: 240,
    },
  }));
  const edges: Edge[] = projection.edges.map((edge, index) => ({
    id: `e-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.type,
    style: { stroke: EDGE_COLOR[edge.type], strokeWidth: 1.5 },
    labelStyle: { fontSize: 9, fill: "#475569" },
  }));
  return { nodes, edges };
}

type InspectorTarget = {
  node: GraphNodeData;
  parents: GraphProjection["nodes"];
};

export default function GraphPage() {
  const queryClient = useQueryClient();
  const graph = useQuery({ queryKey: ["graph"], queryFn: fetchGraph });
  const [selected, setSelected] = useState<GraphNodeData | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [editAliases, setEditAliases] = useState("");
  const [editSkills, setEditSkills] = useState("");
  const [editMetrics, setEditMetrics] = useState("");
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"yaml" | "json">("yaml");
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [actionError, setActionError] = useState<string | null>(null);

  const projection = graph.data ?? null;
  const flow = useMemo(
    () => (projection ? toFlowData(projection) : { nodes: [], edges: [] }),
    [projection],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);

  // Re-sync local flow state whenever the projection refetches.
  const flowKey = JSON.stringify(projection?.stats ?? null);
  const [lastFlowKey, setLastFlowKey] = useState("");
  if (flowKey !== lastFlowKey) {
    setLastFlowKey(flowKey);
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["graph"] });
  }, [queryClient]);

  const onError = useCallback((error: unknown) => {
    setActionError(error instanceof Error ? error.message : String(error));
  }, []);

  const mutations = {
    updateSkill: useMutation({
      mutationFn: (input: {
        id: string;
        label: string;
        detail: string;
        aliases: string[];
      }) =>
        updateGraphSkill(input.id, {
          name: input.label,
          category: input.detail,
          aliases: input.aliases,
        }),
      onSuccess: invalidate,
      onError,
    }),
    updateParent: useMutation({
      mutationFn: (input: { id: string; label: string; detail: string }) =>
        updateGraphParent(input.id, {
          name: input.label,
          title: input.detail,
        }),
      onSuccess: invalidate,
      onError,
    }),
    updateAchievement: useMutation({
      mutationFn: (input: {
        id: string;
        label: string;
        skills: string[];
        metrics: string[];
      }) =>
        updateGraphAchievement(input.id, {
          text: input.label,
          skills: input.skills,
          metrics: input.metrics,
        }),
      onSuccess: invalidate,
      onError,
    }),
    deleteNode: useMutation({
      mutationFn: async (input: { kind: string; id: string }) => {
        if (input.kind === "skill") return deleteGraphSkill(input.id);
        if (input.kind === "achievement")
          return deleteGraphAchievement(input.id);
        return deleteGraphParent(input.id);
      },
      onSuccess: () => {
        setSelected(null);
        invalidate();
      },
      onError,
    }),
    review: useMutation({
      mutationFn: async (reviewed: boolean) =>
        reviewed ? reviewGraph() : unreviewGraph(),
      onSuccess: invalidate,
      onError,
    }),
    importGraph: useMutation({
      mutationFn: () =>
        importGraph({
          format: importFormat,
          mode: importMode,
          content: importText,
        }),
      onSuccess: () => {
        setImportText("");
        setSelected(null);
        invalidate();
      },
      onError,
    }),
    exportGraph: useMutation({
      mutationFn: async (format: "yaml" | "json") => exportGraph(format),
      onSuccess: (result) => {
        const blob = new Blob([JSON.stringify(result.content, null, 2)], {
          type: result.format === "json" ? "application/json" : "text/yaml",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `knowledge-graph.${result.format}`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      onError,
    }),
  };

  function openInspector(node: Node) {
    const data = node.data as { label: string; kind: string; detail: string };
    const kind = data.kind as GraphNodeData["kind"];
    setSelected({ id: node.id, kind, label: data.label, detail: data.detail });
    setEditLabel(data.label);
    setEditDetail(data.detail);
    setEditAliases("");
    setEditSkills("");
    setEditMetrics("");
    setActionError(null);
    // Load full records for array fields the projection doesn't carry.
    if (kind === "skill") {
      fetchGraphSkill(node.id)
        .then((skill) => setEditAliases(skill.aliases.join(", ")))
        .catch(() => undefined);
    } else if (kind === "achievement") {
      fetchGraphAchievement(node.id)
        .then((achievement) => {
          const names = new Map(
            (projection?.nodes ?? [])
              .filter((entry) => entry.kind === "skill")
              .map((entry) => [entry.id, entry.label]),
          );
          setEditSkills(
            achievement.skills.map((id) => names.get(id) ?? id).join(", "),
          );
          setEditMetrics(achievement.metrics.join("\n"));
        })
        .catch(() => undefined);
    }
  }

  function skillsTextToIds(text: string): string[] | null {
    // Accept skill names or ids; reject anything unknown before saving.
    const names = new Map(
      (projection?.nodes ?? [])
        .filter((entry) => entry.kind === "skill")
        .flatMap((entry) => [
          [entry.label.toLowerCase(), entry.id],
          [entry.id.toLowerCase(), entry.id],
        ]),
    );
    const ids: string[] = [];
    for (const token of text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      const id = names.get(token.toLowerCase());
      if (!id) {
        setActionError(`Unknown skill: "${token}". Add it first.`);
        return null;
      }
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  const saveSelected = useCallback(() => {
    if (!selected) return;
    if (selected.kind === "skill") {
      mutations.updateSkill.mutate({
        id: selected.id,
        label: editLabel,
        detail: editDetail,
        aliases: editAliases
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      });
    } else if (selected.kind === "achievement") {
      const skills = skillsTextToIds(editSkills);
      if (skills === null) return;
      mutations.updateAchievement.mutate({
        id: selected.id,
        label: editLabel,
        skills,
        metrics: editMetrics
          .split("\n")
          .map((part) => part.trim())
          .filter(Boolean),
      });
    } else if (selected.kind === "experience" || selected.kind === "project") {
      mutations.updateParent.mutate({
        id: selected.id,
        label: editLabel,
        detail: editDetail,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, editLabel, editDetail, editAliases, editSkills, editMetrics]);

  const deletable =
    selected != null &&
    ["skill", "experience", "project", "achievement"].includes(selected.kind);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Knowledge graph</h1>
          {projection && (
            <p className="text-sm text-slate-500">
              {projection.stats.skills} skills · {projection.stats.parents}{" "}
              experiences/projects · {projection.stats.achievements}{" "}
              achievements · {projection.stats.edges} edges
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {projection?.reviewed_at ? (
            <button
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700"
              onClick={() => mutations.review.mutate(false)}
            >
              Reviewed ✓ (click to un-review)
            </button>
          ) : (
            <button
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
              onClick={() => mutations.review.mutate(true)}
            >
              Mark reviewed
            </button>
          )}
          <button
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
            onClick={() => mutations.exportGraph.mutate("yaml")}
          >
            Export YAML
          </button>
          <button
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
            onClick={() => mutations.exportGraph.mutate("json")}
          >
            Export JSON
          </button>
        </div>
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[540px] overflow-hidden rounded-xl border border-slate-200 bg-white">
          {graph.isPending ? (
            <p className="p-6 text-sm text-slate-500">Loading graph…</p>
          ) : graph.isError ? (
            <p role="alert" className="p-6 text-sm text-rose-600">
              Failed to load graph: {String(graph.error)}
            </p>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => openInspector(node)}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>

        <div className="space-y-4">
          {selected ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ background: KIND_COLOR[selected.kind] ?? "#64748b" }}
                >
                  {selected.kind}
                </span>
                <code className="text-xs text-slate-400">{selected.id}</code>
              </div>
              <label className="block text-sm font-medium">
                Label
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={editLabel}
                  onChange={(event) => setEditLabel(event.target.value)}
                />
              </label>
              {(selected.kind === "skill" ||
                selected.kind === "experience" ||
                selected.kind === "project") && (
                <label className="block text-sm font-medium">
                  {selected.kind === "skill" ? "Category" : "Title"}
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={editDetail}
                    onChange={(event) => setEditDetail(event.target.value)}
                  />
                </label>
              )}
              {selected.kind === "skill" && (
                <label className="block text-sm font-medium">
                  Aliases (comma-separated)
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={editAliases}
                    onChange={(event) => setEditAliases(event.target.value)}
                    placeholder="JS, Javascript"
                  />
                </label>
              )}
              {selected.kind === "achievement" && (
                <>
                  <label className="block text-sm font-medium">
                    Skills (comma-separated names)
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      value={editSkills}
                      onChange={(event) => setEditSkills(event.target.value)}
                      placeholder="TypeScript, React.js"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Metrics (one per line)
                    <textarea
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                      rows={3}
                      value={editMetrics}
                      onChange={(event) => setEditMetrics(event.target.value)}
                      placeholder={"2M req/day\n40% faster"}
                    />
                  </label>
                </>
              )}
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  disabled={mutations.updateSkill.isPending}
                  onClick={saveSelected}
                >
                  Save
                </button>
                {deletable && (
                  <button
                    className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                    onClick={() =>
                      mutations.deleteNode.mutate({
                        kind: selected.kind,
                        id: selected.id,
                      })
                    }
                  >
                    Delete
                  </button>
                )}
                <button
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Click a node to view and edit it. Colors: indigo = skill, cyan =
              experience, teal = project, amber = achievement.
            </p>
          )}

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">Import</h2>
            <div className="flex gap-2 text-sm">
              <select
                className="rounded-lg border border-slate-300 px-2 py-1.5"
                value={importFormat}
                onChange={(event) =>
                  setImportFormat(event.target.value as "yaml" | "json")
                }
              >
                <option value="yaml">YAML</option>
                <option value="json">JSON</option>
              </select>
              <select
                className="rounded-lg border border-slate-300 px-2 py-1.5"
                value={importMode}
                onChange={(event) =>
                  setImportMode(event.target.value as "replace" | "merge")
                }
              >
                <option value="replace">Replace</option>
                <option value="merge">Merge</option>
              </select>
            </div>
            <textarea
              className="h-32 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
              placeholder="Paste a profile document (skills, experiences, projects, achievements…)"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
            <button
              className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
              disabled={!importText.trim() || mutations.importGraph.isPending}
              onClick={() => mutations.importGraph.mutate()}
            >
              {mutations.importGraph.isPending ? "Importing…" : "Import graph"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
