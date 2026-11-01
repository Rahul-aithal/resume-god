import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { GraphNode as GraphNodeData } from "@resume-god/api-client";
import type { NodePositions } from "../components/GraphCanvas";
import GraphTable from "../components/GraphTable";
import { ExpandIcon } from "../components/icons";
import SidePanelLayout from "../components/SidePanelLayout";
import { SelectField } from "../components/SelectField";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import {
  Alert,
  Button,
  buttonVariants,
  cx,
  Card,
  DotBadge,
  Field,
  KindBadge,
  Input,
  Textarea,
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
import GraphAddForm from "../components/GraphAddForm";
import { GRAPH_KINDS } from "../lib/graph-kinds";

const loadCanvas = () => import("../components/GraphCanvas");
const GraphCanvas = lazy(loadCanvas);

const IMPORT_PLACEHOLDER =
  "Paste a profile document (skills, experiences, projects, achievements…)";

const IMPORT_FORMATS = [
  { value: "yaml", label: "YAML" },
  { value: "json", label: "JSON" },
];

const IMPORT_MODES = [
  { value: "merge", label: "Merge" },
  { value: "replace", label: "Replace" },
];

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
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const [actionError, setActionError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [view, setView] = useState<"graph" | "table">("table");
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodePositions = useRef<NodePositions>(new Map());
  // "css" is the fallback where the browser refuses real fullscreen, such as
  // inside an embedded preview. It fills the window instead.
  const [fullscreen, setFullscreen] = useState<"off" | "native" | "css">("off");

  async function toggleFullscreen() {
    if (fullscreen === "native") {
      await document.exitFullscreen();
    } else if (fullscreen === "css") {
      setFullscreen("off");
    } else {
      try {
        await canvasRef.current!.requestFullscreen();
        setFullscreen("native");
      } catch {
        setFullscreen("css");
      }
    }
  }

  useEffect(() => {
    if (fullscreen === "off") return;
    // The browser exits real fullscreen on Esc by itself; the fallback can't.
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen("off");
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen("off");
    };
    if (fullscreen === "native") {
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Fetched on demand so the sample never ships in the JS bundle.
  async function loadSample() {
    setSampleLoading(true);
    setActionError(null);
    try {
      const response = await fetch(`/samples/profile-sample.${importFormat}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setImportText(await response.text());
    } catch (error) {
      setActionError(`Could not load the sample: ${String(error)}`);
    } finally {
      setSampleLoading(false);
    }
  }

  const projection = graph.data ?? null;
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
        const text =
          typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content, null, 2);
        const blob = new Blob([text], {
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

  function openInspector(node: GraphNodeData) {
    const { kind } = node;
    setSelected(node);
    setEditLabel(node.label);

    setEditDetail(node.detail);
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

  const inspector = selected ? (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <KindBadge kind={selected.kind} />
        <code className="truncate text-xs text-ink-2">{selected.id}</code>
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
  ) : null;

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

      <Tabs
        value={view}
        onValueChange={(next) => setView(next as "graph" | "table")}
        className="gap-0"
      >
        <SidePanelLayout
          id="graph-panel"
          sideLabel="panel"
          heightClass="h-[calc(100dvh-10.5rem)]"
          reveal={selected?.id}
          toolbar={
            <TabsList>
              <TabsTrigger value="table">Table</TabsTrigger>
              <TabsTrigger
                value="graph"
                onMouseEnter={() => void loadCanvas()}
                onFocus={() => void loadCanvas()}
              >
                Graph
              </TabsTrigger>
            </TabsList>
          }
          side={
            <>
              {selected && fullscreen === "off" ? (
                inspector
              ) : !selected ? (
                <Card className="space-y-3 p-4 text-sm text-ink-2">
                  <p>Click a node or table row to view and edit it.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {GRAPH_KINDS.map((kind) => (
                      <DotBadge key={kind} color={`kind-${kind}`}>
                        {kind}
                      </DotBadge>
                    ))}
                  </div>
                </Card>
              ) : null}

              <GraphAddForm projection={projection} />

              <Card className="space-y-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold">Import</h2>
                  <p className="mt-1 text-xs text-ink-2">
                    Paste a whole profile. Start from the sample to see the
                    format.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    loading={sampleLoading}
                    onClick={() => void loadSample()}
                  >
                    Load sample
                  </Button>
                  <a
                    href={`/samples/profile-sample.${importFormat}`}
                    download
                    className={buttonVariants("secondary")}
                  >
                    Download sample
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField
                    aria-label="Import format"
                    value={importFormat}
                    onValueChange={(next) =>
                      setImportFormat(next as "yaml" | "json")
                    }
                    options={IMPORT_FORMATS}
                  />
                  <SelectField
                    aria-label="Import mode"
                    value={importMode}
                    onValueChange={(next) =>
                      setImportMode(next as "replace" | "merge")
                    }
                    options={IMPORT_MODES}
                  />
                </div>
                {importMode === "replace" ? (
                  <Alert tone="review">
                    Replace deletes your current graph before importing.
                  </Alert>
                ) : (
                  <p className="text-xs text-ink-2">
                    Merge keeps your graph and adds or updates matching ids.
                  </p>
                )}
                <div className="relative">
                  <Textarea
                    className="h-32 p-2 pr-9 font-mono text-xs [field-sizing:fixed]"
                    aria-label="Profile document"
                    placeholder={IMPORT_PLACEHOLDER}
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Expand editor"
                    title="Expand editor"
                    className="absolute top-1 right-1 size-7 p-0"
                    onClick={() => setEditorOpen(true)}
                  >
                    <ExpandIcon className="size-4" />
                  </Button>
                </div>
                <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
                  <DialogContent className="flex h-[85vh] w-[92vw] max-w-[92vw] flex-col sm:max-w-5xl">
                    <DialogHeader>
                      <DialogTitle>Profile document</DialogTitle>
                      <DialogDescription>
                        Paste or edit your {importFormat.toUpperCase()} here.
                        Your text stays in the import box when you close this.
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      autoFocus
                      aria-label="Profile document, expanded"
                      className="min-h-0 flex-1 resize-none p-3 font-mono text-sm leading-relaxed [field-sizing:fixed]"
                      spellCheck={false}
                      placeholder={IMPORT_PLACEHOLDER}
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button onClick={() => setEditorOpen(false)}>Done</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={
                    !importText.trim() || mutations.importGraph.isPending
                  }
                  loading={mutations.importGraph.isPending}
                  onClick={() => mutations.importGraph.mutate()}
                >
                  {mutations.importGraph.isPending
                    ? "Importing…"
                    : "Import graph"}
                </Button>
              </Card>
            </>
          }
        >
          <TabsContent value="graph" className="h-[540px] lg:h-full">
            <div
              ref={canvasRef}
              className={cx(
                "h-full",
                fullscreen !== "off" && "relative bg-surface",
                fullscreen === "css" && "fixed! inset-0 z-50",
              )}
            >
              <Card
                className={cx(
                  "graph-canvas h-full gap-0 overflow-hidden py-0",
                  fullscreen !== "off" && "rounded-none ring-0",
                )}
              >
                {graph.isPending ? (
                  <p className="p-6 text-sm text-ink-2">Loading graph…</p>
                ) : graph.isError ? (
                  <Alert role="alert" className="m-6">
                    Failed to load graph: {String(graph.error)}
                  </Alert>
                ) : (
                  <Suspense
                    fallback={
                      <p className="p-6 text-sm text-ink-2">Loading graph…</p>
                    }
                  >
                    <GraphCanvas
                      projection={projection!}
                      positions={nodePositions}
                      onOpenNode={openInspector}
                      fullscreen={fullscreen !== "off"}
                      onToggleFullscreen={() => void toggleFullscreen()}
                    />
                  </Suspense>
                )}
              </Card>
              {fullscreen !== "off" && selected && (
                <div className="absolute top-3 right-3 z-10 max-h-[calc(100%-1.5rem)] w-80 space-y-3 overflow-y-auto">
                  {actionError && <Alert role="alert">{actionError}</Alert>}
                  {inspector}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent
            value="table"
            // Kept mounted so filters and the page survive switching tabs.
            // The graph tab isn't: its canvas loads and mounts only when open.
            keepMounted
            className="h-[540px] lg:h-full"
          >
            {projection ? (
              <GraphTable
                projection={projection}
                selectedId={selected?.id}
                onOpen={openInspector}
              />
            ) : graph.isError ? (
              <Alert role="alert">
                Failed to load graph: {String(graph.error)}
              </Alert>
            ) : (
              <p className="p-6 text-sm text-ink-2">Loading graph…</p>
            )}
          </TabsContent>
        </SidePanelLayout>
      </Tabs>
    </div>
  );
}
