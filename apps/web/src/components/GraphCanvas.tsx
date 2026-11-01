import {
  Background,
  ControlButton,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useRef, type RefObject } from "react";
import type {
  GraphEdgeType,
  GraphNode,
  GraphProjection,
} from "@resume-god/api-client";
import { GRAPH_KINDS } from "../lib/graph-kinds";
import { CollapseIcon, ExpandIcon, FitViewIcon } from "./icons";

export type NodePositions = Map<string, { x: number; y: number }>;

/** Node and edge colors read the theme's CSS variables, so the canvas
 * follows light/dark without re-rendering the graph. */
const kindColor = (kind: string) => `var(--kind-${kind}, var(--st-wishlist))`;

const EDGE_COLOR: Record<GraphEdgeType, string> = {
  USES: "var(--kind-experience)",
  PART_OF: "var(--line-strong)",
  DEMONSTRATES: "var(--kind-achievement)",
  IMPLIES: "var(--kind-skill)",
};

function toFlowData(
  projection: GraphProjection,
  positions: NodePositions,
): { nodes: Node[]; edges: Edge[] } {
  const counts = new Map<string, number>();
  const grid = (kind: GraphNode["kind"]) => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return {
      x: GRAPH_KINDS.indexOf(kind) * 280,
      y: (counts.get(kind)! - 1) * 90,
    };
  };
  const nodes: Node[] = projection.nodes.map((node) => {
    const position = grid(node.kind);
    return {
      id: node.id,
      position: positions.get(node.id) ?? position,
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
    };
  });
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

/**
 * The React Flow canvas. Lazy-loaded the first time the Graph tab opens, so
 * its ~60 KB stays off the page until then, and unmounted when the tab closes
 * to free the nodes. `positions` lives with the caller so drags survive that.
 */
export default function GraphCanvas({
  projection,
  positions,
  onOpenNode,
  fullscreen,
  onToggleFullscreen,
}: {
  projection: GraphProjection;
  positions: RefObject<NodePositions>;
  onOpenNode: (node: GraphNode) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    toFlowData(projection, positions.current).nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    toFlowData(projection, positions.current).edges,
  );

  // Picks up edits and refetches, keeping anything the user has dragged.
  useEffect(() => {
    const flow = toFlowData(projection, positions.current);
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [projection, positions, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => {
        const data = node.data as Omit<GraphNode, "id">;
        onOpenNode({ id: node.id, ...data });
      }}
      onNodeDragStop={(_, node) => {
        positions.current.set(node.id, node.position);
      }}
      fitView
      // The default of 0.5 can't fit a full graph on screen.
      minZoom={0.05}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} bgColor="var(--surface)" color="var(--line)" />
      <CanvasControls
        fullscreen={fullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />
      <FitOnLoad flowKey={JSON.stringify(projection.stats)} />
    </ReactFlow>
  );
}

/** Refits the canvas once per graph state, after nodes have measurable
 * dimensions: the declarative `fitView` prop can run before that. Label edits
 * and drags don't change the stats, so they never reset the user's view. */
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

/** Zoom, fit, and fullscreen. React Flow's own fit button uses a fullscreen-
 * style icon, so it's replaced to keep the two from being mistaken. */
function CanvasControls({
  fullscreen,
  onToggleFullscreen,
}: {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const { fitView } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const previous = useRef({ width, height });

  // Refit when the canvas changes size: fullscreen, or a panel closed or
  // dragged. Debounced so a drag only refits once it settles.
  useEffect(() => {
    if (previous.current.width === width && previous.current.height === height)
      return;
    const firstMeasure = previous.current.width === 0;
    previous.current = { width, height };
    if (firstMeasure) return;
    const timer = setTimeout(
      () => void fitView({ padding: 0.15, duration: 250 }),
      150,
    );
    return () => clearTimeout(timer);
  }, [width, height, fitView]);

  const fullscreenLabel = fullscreen ? "Exit fullscreen" : "Enter fullscreen";
  return (
    <Controls showInteractive={false} showFitView={false}>
      <ControlButton
        title="Fit graph to view"
        aria-label="Fit graph to view"
        onClick={() => void fitView({ padding: 0.15, duration: 250 })}
      >
        <FitViewIcon />
      </ControlButton>
      <ControlButton
        title={fullscreenLabel}
        aria-label={fullscreenLabel}
        onClick={onToggleFullscreen}
      >
        {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
      </ControlButton>
    </Controls>
  );
}
