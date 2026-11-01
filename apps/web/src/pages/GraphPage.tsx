import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";

import type {
  GraphEdgeType,
  GraphNode as GraphNodeData,
  GraphProjection,
} from "@resume-god/api-client";
import {
  Alert,
  Button,
  Card,
  DotBadge,
  Field,
  KindBadge,
  Input,
  Textarea,
  NativeSelect,
} from "../components/ui";
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

const KINDS = [
  "skill",
  "experience",
  "project",
  "achievement",
  "education",
  "certification",
] as const;

/** Node and edge colors read the theme's CSS variables, so the canvas
 * follows light/dark without re-rendering the graph. */
const kindColor = (kind: string) => `var(--kind-${kind}, var(--st-wishlist))`;

const EDGE_COLOR: Record<GraphEdgeType, string> = {
  USES: "var(--kind-experience)",
  PART_OF: "var(--line-strong)",
  DEMONSTRATES: "var(--kind-achievement)",
  IMPLIES: "var(--kind-skill)",
};

function toFlowData(projection: GraphProjection): {
  nodes: Node[];
  edges: Edge[];
} {
  const counts = new Map<string, number>();
  const grid = (kind: string) => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    const column = KINDS.indexOf(kind as (typeof KINDS)[number]);
    return { x: column * 280, y: (counts.get(kind)! - 1) * 90 };
  };
  const nodes: Node[] = projection.nodes.map((node: GraphNodeData) => ({
    id: node.id,
    position: grid(node.kind),
    data: { label: node.label, kind: node.kind, detail: node.detail },
    style: {
      background: "var(--surface)",
      color: "var(--ink)",
      border: `2px solid ${kindColor(node.kind)}`,
      borderRadius: 10,
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
    labelStyle: { fontSize: 9, fill: "var(--ink-2)" },
    labelBgStyle: { fill: "var(--surface)" },
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

  // `fitView` only applies at init and needs measured nodes; FitOnLoad below
  // refits once per graph state. Drags and label edits don't change the
  // stats key, so they never reset the user's view.

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Knowledge graph
          </h1>
          {projection && (
            <p className="tnum mt-1 text-sm text-ink-2">
              {projection.stats.skills} skills · {projection.stats.parents}{" "}
              experiences/projects · {projection.stats.achievements}{" "}
              achievements · {projection.stats.edges} edges
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {projection?.reviewed_at ? (
            <Button
              variant="secondary"
              size="sm"
              loading={mutations.review.isPending}
              onClick={() => mutations.review.mutate(false)}
              className="border-ok/40 text-ok hover:bg-ok/10"
            >
              Reviewed ✓ (click to un-review)
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              loading={mutations.review.isPending}
              onClick={() => mutations.review.mutate(true)}
              className="border-review/50 text-review hover:bg-review/10"
            >
              Mark reviewed
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => mutations.exportGraph.mutate("yaml")}
          >
            Export YAML
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => mutations.exportGraph.mutate("json")}
          >
            Export JSON
          </Button>
        </div>
      </div>

      {actionError && <Alert role="alert">{actionError}</Alert>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="graph-canvas h-[540px] overflow-hidden">
          {graph.isPending ? (
            <p className="p-6 text-sm text-ink-2">Loading graph…</p>
          ) : graph.isError ? (
            <Alert role="alert" className="m-6">
              Failed to load graph: {String(graph.error)}
            </Alert>
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
              <Background
                gap={18}
                bgColor="var(--surface)"
                color="var(--line)"
              />
              <Controls showInteractive={false} />
              <FitOnLoad flowKey={flowKey} />
            </ReactFlow>
          )}
        </Card>

        <div className="space-y-4">
          {selected ? (
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <KindBadge kind={selected.kind} />
                <code className="truncate text-xs text-ink-2">
                  {selected.id}
                </code>
              </div>
              <Field label="Label">
                <Input
                  value={editLabel}
                  onChange={(event) => setEditLabel(event.target.value)}
                />
              </Field>
              {(selected.kind === "skill" ||
                selected.kind === "experience" ||
                selected.kind === "project") && (
                <Field label={selected.kind === "skill" ? "Category" : "Title"}>
                  <Input
                    value={editDetail}
                    onChange={(event) => setEditDetail(event.target.value)}
                  />
                </Field>
              )}
              {selected.kind === "skill" && (
                <Field label="Aliases (comma-separated)">
                  <Input
                    value={editAliases}
                    onChange={(event) => setEditAliases(event.target.value)}
                    placeholder="JS, Javascript"
                  />
                </Field>
              )}
              {selected.kind === "achievement" && (
                <>
                  <Field label="Skills (comma-separated names)">
                    <Input
                      value={editSkills}
                      onChange={(event) => setEditSkills(event.target.value)}
                      placeholder="TypeScript, React.js"
                    />
                  </Field>
                  <Field label="Metrics (one per line)">
                    <Textarea
                      className="font-mono text-xs"
                      rows={3}
                      value={editMetrics}
                      onChange={(event) => setEditMetrics(event.target.value)}
                      placeholder={"2M req/day\n40% faster"}
                    />
                  </Field>
                </>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  loading={mutations.updateSkill.isPending}
                  onClick={saveSelected}
                >
                  Save
                </Button>
                {deletable && (
                  <Button
                    variant="danger"
                    onClick={() =>
                      mutations.deleteNode.mutate({
                        kind: selected.kind,
                        id: selected.id,
                      })
                    }
                  >
                    Delete
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="space-y-3 p-4 text-sm text-ink-2">
              <p>Click a node to view and edit it.</p>
              <div className="flex flex-wrap gap-1.5">
                {KINDS.map((kind) => (
                  <DotBadge key={kind} color={`kind-${kind}`}>
                    {kind}
                  </DotBadge>
                ))}
              </div>
            </Card>
          )}

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Import</h2>
            <div className="flex gap-2 text-sm">
              <NativeSelect
                className="w-auto px-2 py-1.5"
                value={importFormat}
                onChange={(event) =>
                  setImportFormat(event.target.value as "yaml" | "json")
                }
              >
                <option value="yaml">YAML</option>
                <option value="json">JSON</option>
              </NativeSelect>
              <NativeSelect
                className="w-auto px-2 py-1.5"
                value={importMode}
                onChange={(event) =>
                  setImportMode(event.target.value as "replace" | "merge")
                }
              >
                <option value="replace">Replace</option>
                <option value="merge">Merge</option>
              </NativeSelect>
            </div>
            <Textarea
              className="h-32 p-2 font-mono text-xs"
              placeholder="Paste a profile document (skills, experiences, projects, achievements…)"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
            <Button
              variant="secondary"
              className="w-full"
              disabled={!importText.trim() || mutations.importGraph.isPending}
              loading={mutations.importGraph.isPending}
              onClick={() => mutations.importGraph.mutate()}
            >
              {mutations.importGraph.isPending ? "Importing…" : "Import graph"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Refits the canvas once per graph state, after nodes have measurable
 * dimensions — the declarative `fitView` prop can run before that. */
function FitOnLoad({ flowKey }: { flowKey: string }) {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const fittedKey = useRef("");
  useEffect(() => {
    if (!initialized || fittedKey.current === flowKey) return;
    fittedKey.current = flowKey;
    void fitView({ padding: 0.15, duration: 250 });
  }, [initialized, flowKey, fitView]);
  return null;
}
