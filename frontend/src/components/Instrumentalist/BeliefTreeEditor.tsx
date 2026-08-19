/**
 * Belief tree canvas — @xyflow/react nodes (idea/group) with weight edit trays,
 * hierarchy/group cables, keyboard + button delete (removes connected edges).
 *
 * Delete keys: React Flow's default `deleteKeyCode` ('Backspace') is a document-
 * level listener. It deletes selected nodes even when focus is on toolbar
 * buttons (e.g. Add group) or after leaving an idea textarea — see xyflow
 * `useGlobalKeyHandler` / docs for `deleteKeyCode`. We set `deleteKeyCode={null}`
 * and only delete when the event originates inside this canvas and is not an
 * editable / interactive target (see beliefTreeDeleteGuard).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnEdgesChange,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  isFlowDeleteKey,
  shouldIgnoreFlowDeleteKey,
} from "../../lib/beliefTreeDeleteGuard";
import type { BeliefEdge, BeliefNode, BeliefTree } from "../../lib/instrumentalist";
import "./BeliefTreeEditor.css";

export type IdeaNodeData = {
  kind: "idea" | "group";
  text: string;
  weight: number;
  groupId?: string;
  onChangeText: (id: string, text: string) => void;
  onChangeWeight: (id: string, weight: number) => void;
  onDeleteNode: (id: string) => void;
};

function IdeaCardNode({ id, data, selected }: NodeProps<Node<IdeaNodeData>>) {
  const isGroup = data.kind === "group";
  return (
    <div
      className={`instru-node ${isGroup ? "instru-node--group" : "instru-node--idea"}${
        selected ? " instru-node--selected" : ""
      }`}
    >
      <Handle
        id="t"
        type="target"
        position={Position.Top}
        className="instru-node__handle"
        isConnectable
      />
      <Handle
        id="l"
        type="target"
        position={Position.Left}
        className="instru-node__handle instru-node__handle--side"
        isConnectable
      />
      <div className="instru-node__chrome">
        <div className="instru-node__label">{isGroup ? "Group" : "Idea"}</div>
        <button
          type="button"
          className="instru-node__delete nokey"
          title="Delete node"
          aria-label="Delete node"
          onClick={(e) => {
            e.stopPropagation();
            data.onDeleteNode(id);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ×
        </button>
      </div>
      <label className="instru-node__field">
        <span className="instru-node__field-label">Text</span>
        <textarea
          className="instru-node__input nodrag nopan nokey"
          value={data.text}
          rows={isGroup ? 2 : 3}
          onChange={(e) => data.onChangeText(id, e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </label>
      {!isGroup && (
        <label className="instru-node__field">
          <span className="instru-node__field-label">Weight</span>
          <input
            className="instru-node__input instru-node__input--weight nodrag nopan nokey"
            type="number"
            min={0}
            step={0.1}
            value={data.weight}
            onChange={(e) => data.onChangeWeight(id, Number(e.target.value) || 0)}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </label>
      )}
      <Handle
        id="b"
        type="source"
        position={Position.Bottom}
        className="instru-node__handle"
        isConnectable
      />
      <Handle
        id="r"
        type="source"
        position={Position.Right}
        className="instru-node__handle instru-node__handle--side"
        isConnectable
      />
    </div>
  );
}

const nodeTypes = { instruCard: IdeaCardNode };

type BeliefTreeEditorProps = {
  tree: BeliefTree;
  onChange: (tree: BeliefTree) => void;
  connectKind: "hierarchy" | "group";
};

function edgeStyle(kind: "hierarchy" | "group"): Partial<Edge> {
  return {
    type: "smoothstep",
    label: kind === "group" ? "group" : "hierarchy",
    className:
      kind === "group" ? "instru-edge instru-edge--group" : "instru-edge instru-edge--hierarchy",
    animated: kind === "hierarchy",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: kind === "group" ? "var(--site-muted-fg)" : "var(--site-accent)",
    },
  };
}

function toFlowNodes(
  tree: BeliefTree,
  onChangeText: (id: string, text: string) => void,
  onChangeWeight: (id: string, weight: number) => void,
  onDeleteNode: (id: string) => void,
): Node<IdeaNodeData>[] {
  return tree.nodes.map((n) => ({
    id: n.id,
    type: "instruCard",
    position: { x: n.position.x, y: n.position.y },
    data: {
      kind: n.kind,
      text: n.text,
      weight: n.weight,
      groupId: n.groupId,
      onChangeText,
      onChangeWeight,
      onDeleteNode,
    },
  }));
}

function toFlowEdges(tree: BeliefTree): Edge[] {
  return tree.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...edgeStyle(e.kind),
  }));
}

function fromFlow(
  nodes: Node<IdeaNodeData>[],
  edges: Edge[],
  prev: BeliefTree,
): BeliefTree {
  const prevById = new Map(prev.nodes.map((n) => [n.id, n]));
  const nextNodes: BeliefNode[] = nodes.map((n) => {
    const prevN = prevById.get(n.id);
    return {
      id: n.id,
      kind: n.data.kind,
      text: n.data.text,
      weight: n.data.weight,
      groupId: n.data.groupId ?? prevN?.groupId ?? "",
      position: { x: n.position.x, y: n.position.y },
    };
  });
  const prevEdge = new Map(prev.edges.map((e) => [e.id, e]));
  const nextEdges: BeliefEdge[] = edges.map((e) => {
    const prior = prevEdge.get(e.id);
    const kind: "hierarchy" | "group" =
      prior?.kind ??
      (typeof e.label === "string" && e.label === "group" ? "group" : "hierarchy");
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      kind,
    };
  });
  return { nodes: nextNodes, edges: nextEdges };
}

function removeNodesFromTree(tree: BeliefTree, ids: Set<string>): BeliefTree {
  const nodes = tree.nodes
    .filter((n) => !ids.has(n.id))
    .map((n) => (n.groupId && ids.has(n.groupId) ? { ...n, groupId: "" } : n));
  const edges = tree.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target));
  return { nodes, edges };
}

function removeEdgesFromTree(tree: BeliefTree, ids: Set<string>): BeliefTree {
  const removed = tree.edges.filter((e) => ids.has(e.id));
  let nodes = tree.nodes;
  for (const e of removed) {
    if (e.kind === "group") {
      nodes = nodes.map((n) =>
        n.id === e.target && n.groupId === e.source ? { ...n, groupId: "" } : n,
      );
    }
  }
  return {
    nodes,
    edges: tree.edges.filter((e) => !ids.has(e.id)),
  };
}

export default function BeliefTreeEditor({
  tree,
  onChange,
  connectKind,
}: BeliefTreeEditorProps) {
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const suppressSync = useRef(false);

  const onChangeText = useCallback(
    (id: string, text: string) => {
      const t = treeRef.current;
      onChange({
        ...t,
        nodes: t.nodes.map((n) => (n.id === id ? { ...n, text } : n)),
      });
    },
    [onChange],
  );

  const onChangeWeight = useCallback(
    (id: string, weight: number) => {
      const t = treeRef.current;
      onChange({
        ...t,
        nodes: t.nodes.map((n) => (n.id === id ? { ...n, weight } : n)),
      });
    },
    [onChange],
  );

  const onDeleteNode = useCallback(
    (id: string) => {
      onChange(removeNodesFromTree(treeRef.current, new Set([id])));
    },
    [onChange],
  );

  const initialNodes = useMemo(
    () => toFlowNodes(tree, onChangeText, onChangeWeight, onDeleteNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync via effect
    [tree],
  );
  const initialEdges = useMemo(() => toFlowEdges(tree), [tree]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    if (suppressSync.current) {
      suppressSync.current = false;
      return;
    }
    setNodes(toFlowNodes(tree, onChangeText, onChangeWeight, onDeleteNode));
    setEdges(toFlowEdges(tree));
  }, [tree, onChangeText, onChangeWeight, onDeleteNode, setNodes, setEdges]);

  const commitPositions = useCallback(
    (nextNodes: Node<IdeaNodeData>[], nextEdges: Edge[]) => {
      suppressSync.current = true;
      onChange(fromFlow(nextNodes, nextEdges, treeRef.current));
    },
    [onChange],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<IdeaNodeData>>[]) => {
      onNodesChange(changes);
      const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
      if (removed.length > 0) {
        onChange(removeNodesFromTree(treeRef.current, new Set(removed)));
      }
    },
    [onNodesChange, onChange],
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
      if (removed.length > 0) {
        onChange(removeEdgesFromTree(treeRef.current, new Set(removed)));
      }
    },
    [onEdgesChange, onChange],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceId = connection.source;
      const targetId = connection.target;
      if (!sourceId || !targetId || sourceId === targetId) return false;
      const t = treeRef.current;
      const source = t.nodes.find((n) => n.id === sourceId);
      const target = t.nodes.find((n) => n.id === targetId);
      if (!source || !target) return false;

      if (connectKind === "group") {
        return source.kind === "group" && target.kind === "idea";
      }
      // Hierarchy: idea → idea within the same group (including both ungrouped).
      if (source.kind !== "idea" || target.kind !== "idea") return false;
      return (source.groupId || "") === (target.groupId || "");
    },
    [connectKind],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (!isValidConnection(connection)) return;

      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `e-${Date.now()}`;
      const edge: Edge = {
        id,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        ...edgeStyle(connectKind),
      };

      setEdges((eds) => addEdge(edge, eds));

      const t = treeRef.current;
      const belief: BeliefEdge = {
        id,
        source: connection.source,
        target: connection.target,
        kind: connectKind,
      };
      let nextNodes = t.nodes;
      if (connectKind === "group") {
        nextNodes = t.nodes.map((n) =>
          n.id === connection.target ? { ...n, groupId: connection.source! } : n,
        );
      }
      const nextEdges = [
        ...t.edges.filter(
          (e) =>
            !(
              e.source === belief.source &&
              e.target === belief.target &&
              e.kind === belief.kind
            ),
        ),
        belief,
      ];
      suppressSync.current = true;
      onChange({ nodes: nextNodes, edges: nextEdges });
    },
    [connectKind, isValidConnection, onChange, setEdges],
  );

  const onNodeDragStop: OnNodeDrag<Node<IdeaNodeData>> = useCallback(
    (_event, _node, currentNodes) => {
      commitPositions(currentNodes, edges);
    },
    [commitPositions, edges],
  );

  const flowWrapRef = useRef<HTMLDivElement>(null);

  // Canvas-scoped delete: never use React Flow's global deleteKeyCode.
  // Repro (fixed): select idea → focus Add group / leave textarea → Backspace
  // used to remove the still-selected idea via document-level useKeyPress.
  useEffect(() => {
    const wrap = flowWrapRef.current;
    if (!wrap) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isFlowDeleteKey(event.key)) return;
      const active = document.activeElement;
      if (!active || !wrap.contains(active)) return;
      if (shouldIgnoreFlowDeleteKey(active)) return;

      const selectedNodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
      const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);
      if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;

      event.preventDefault();
      let next = treeRef.current;
      if (selectedNodeIds.length > 0) {
        next = removeNodesFromTree(next, new Set(selectedNodeIds));
      }
      if (selectedEdgeIds.length > 0) {
        next = removeEdgesFromTree(next, new Set(selectedEdgeIds));
      }
      onChange(next);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [nodes, edges, onChange]);

  return (
    <div className="instru-flow" ref={flowWrapRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        nodesConnectable
        nodesDraggable
        elementsSelectable
        edgesFocusable
        edgesReconnectable
        connectionMode={ConnectionMode.Loose}
        connectionRadius={28}
        snapToGrid
        snapGrid={[12, 12]}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        selectionOnDrag={false}
        panOnDrag
        zoomOnScroll
        defaultEdgeOptions={{
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
      >
        <Background gap={20} size={1} color="var(--site-border)" />
        <Controls />
        <MiniMap
          nodeColor={() => "var(--site-accent)"}
          maskColor="color-mix(in srgb, var(--site-body-bg) 70%, transparent)"
        />
      </ReactFlow>
    </div>
  );
}
