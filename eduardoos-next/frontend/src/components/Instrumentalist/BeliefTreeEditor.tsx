/**
 * Belief tree canvas — @xyflow/react nodes (idea/group) with weight edit trays
 * and hierarchy/group cables. Themed with --site-* tokens.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { BeliefEdge, BeliefNode, BeliefTree } from "../../lib/instrumentalist";
import "./BeliefTreeEditor.css";

export type IdeaNodeData = {
  kind: "idea" | "group";
  text: string;
  weight: number;
  groupId?: string;
  onChangeText: (id: string, text: string) => void;
  onChangeWeight: (id: string, weight: number) => void;
};

function IdeaCardNode({ id, data, selected }: NodeProps<Node<IdeaNodeData>>) {
  const isGroup = data.kind === "group";
  return (
    <div
      className={`instru-node ${isGroup ? "instru-node--group" : "instru-node--idea"}${
        selected ? " instru-node--selected" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="instru-node__handle" />
      <div className="instru-node__label">{isGroup ? "Group" : "Idea"}</div>
      <label className="instru-node__field">
        <span className="instru-node__field-label">Text</span>
        <textarea
          className="instru-node__input"
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
            className="instru-node__input instru-node__input--weight"
            type="number"
            min={0}
            step={0.1}
            value={data.weight}
            onChange={(e) => data.onChangeWeight(id, Number(e.target.value) || 0)}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </label>
      )}
      <Handle type="source" position={Position.Bottom} className="instru-node__handle" />
    </div>
  );
}

const nodeTypes = { instruCard: IdeaCardNode };

type BeliefTreeEditorProps = {
  tree: BeliefTree;
  onChange: (tree: BeliefTree) => void;
  connectKind: "hierarchy" | "group";
};

function toFlowNodes(
  tree: BeliefTree,
  onChangeText: (id: string, text: string) => void,
  onChangeWeight: (id: string, weight: number) => void,
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
    },
  }));
}

function toFlowEdges(tree: BeliefTree): Edge[] {
  return tree.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.kind === "group" ? "group" : "hierarchy",
    className:
      e.kind === "group" ? "instru-edge instru-edge--group" : "instru-edge instru-edge--hierarchy",
    animated: e.kind === "hierarchy",
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
    const kind =
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

export default function BeliefTreeEditor({
  tree,
  onChange,
  connectKind,
}: BeliefTreeEditorProps) {
  const onChangeText = useCallback(
    (id: string, text: string) => {
      onChange({
        ...tree,
        nodes: tree.nodes.map((n) => (n.id === id ? { ...n, text } : n)),
      });
    },
    [onChange, tree],
  );

  const onChangeWeight = useCallback(
    (id: string, weight: number) => {
      onChange({
        ...tree,
        nodes: tree.nodes.map((n) => (n.id === id ? { ...n, weight } : n)),
      });
    },
    [onChange, tree],
  );

  const initialNodes = useMemo(
    () => toFlowNodes(tree, onChangeText, onChangeWeight),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync via effect
    [tree],
  );
  const initialEdges = useMemo(() => toFlowEdges(tree), [tree]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(toFlowNodes(tree, onChangeText, onChangeWeight));
    setEdges(toFlowEdges(tree));
  }, [tree, onChangeText, onChangeWeight, setNodes, setEdges]);

  const emitFromFlow = useCallback(
    (nextNodes: Node<IdeaNodeData>[], nextEdges: Edge[]) => {
      onChange(fromFlow(nextNodes, nextEdges, tree));
    },
    [onChange, tree],
  );

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // Position updates after React Flow applies changes — deferred tick.
      queueMicrotask(() => {
        setNodes((current) => {
          emitFromFlow(current as Node<IdeaNodeData>[], edges);
          return current;
        });
      });
    },
    [onNodesChange, setNodes, edges, emitFromFlow],
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      queueMicrotask(() => {
        setEdges((current) => {
          emitFromFlow(nodes as Node<IdeaNodeData>[], current);
          return current;
        });
      });
    },
    [onEdgesChange, setEdges, nodes, emitFromFlow],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `e-${Date.now()}`;
      const edge: Edge = {
        id,
        source: connection.source,
        target: connection.target,
        label: connectKind,
        className:
          connectKind === "group"
            ? "instru-edge instru-edge--group"
            : "instru-edge instru-edge--hierarchy",
        animated: connectKind === "hierarchy",
      };
      setEdges((eds) => {
        const next = addEdge(edge, eds);
        const belief: BeliefEdge = {
          id,
          source: connection.source!,
          target: connection.target!,
          kind: connectKind,
        };
        let nextNodes = tree.nodes;
        if (connectKind === "group") {
          nextNodes = tree.nodes.map((n) =>
            n.id === connection.target ? { ...n, groupId: connection.source! } : n,
          );
        }
        onChange({
          nodes: nextNodes,
          edges: [...tree.edges.filter((e) => e.id !== id), belief],
        });
        return next;
      });
    },
    [connectKind, onChange, setEdges, tree],
  );

  const onNodeDragStop = useCallback(
    (_: ReactMouseEvent, _node: Node) => {
      setNodes((current) => {
        onChange(fromFlow(current as Node<IdeaNodeData>[], edges, tree));
        return current;
      });
    },
    [setNodes, onChange, edges, tree],
  );

  return (
    <div className="instru-flow">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Backspace", "Delete"]}
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
