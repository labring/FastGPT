import { create } from '@fastgpt/web/common/zustand';
import type { FastGPTWorkflowNode, WorkflowStateType } from '../context/type';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/node';
import type { NodeChange, EdgeChange, Connection, Edge } from '@xyflow/react';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { EDGE_TYPE, isNestedParentNodeType } from '@fastgpt/global/core/workflow/node/constant';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { WorkflowSnapshotsType } from '../context/workflowSnapshotContext';
import { compareSnapshot } from '@/web/core/workflow/utils';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';

const maxSnapshots = 100;

/**
 * 保持父容器节点与子节点的层叠层级 (zIndex) 同步:
 * 当容器内有子节点处于选中或拖拽状态时，父容器必须同步提升层级至 1000，
 * 防止父容器被画布上的其他未选中节点遮挡（避免子节点浮在上面、父容器被压在下面的错位穿透）。
 * 当子节点均未被选中或拖拽时，父容器 zIndex 恢复为 0。
 */
export const syncParentNodesZIndex = (nodes: FastGPTWorkflowNode[]): FastGPTWorkflowNode[] => {
  const activeParentIds = new Set<string>();
  for (const node of nodes) {
    if ((node.selected || node.dragging) && node.data?.parentNodeId) {
      activeParentIds.add(node.data.parentNodeId);
    }
  }

  let hasChanged = false;
  const updatedNodes = nodes.map((node) => {
    if (isNestedParentNodeType(node.type ?? node.data?.flowNodeType ?? '')) {
      const targetZIndex = activeParentIds.has(node.id) ? 1000 : 0;
      if (node.zIndex !== targetZIndex) {
        hasChanged = true;
        return {
          ...node,
          zIndex: targetZIndex
        };
      }
    }
    return node;
  });

  return hasChanged ? updatedNodes : nodes;
};

/**
 * 保持连线 (Edge) 与父子容器节点的层叠层级 (zIndex) 同步:
 * 当连线的起点或终点属于容器子节点时，连线必须提升层级至 2000，
 * 确保连线渲染在父容器卡片 (zIndex: 0 或 1000) 之上，且在子节点 (zIndex: 2001) 之下。
 * 普通顶层连线保持 undefined (默认 0)。
 */
export const syncEdgesZIndex = (edges: Edge[], nodes: FastGPTWorkflowNode[]): Edge[] => {
  const childNodeIds = new Set<string>();
  for (const node of nodes) {
    if (node.data?.parentNodeId) {
      childNodeIds.add(node.id);
    }
  }

  let hasChanged = false;
  const updatedEdges = edges.map((edge) => {
    const isChildEdge = childNodeIds.has(edge.source) || childNodeIds.has(edge.target);
    const targetZIndex = isChildEdge ? 2000 : undefined;
    if (edge.zIndex !== targetZIndex) {
      hasChanged = true;
      return {
        ...edge,
        zIndex: targetZIndex
      };
    }
    return edge;
  });

  return hasChanged ? updatedEdges : edges;
};

export type WorkflowStoreState = {
  // === Node Slice ===
  nodes: FastGPTWorkflowNode[];
  basicNodeTemplates: FlowNodeTemplateType[];
  setNodes: (
    nodes: FastGPTWorkflowNode[] | ((prev: FastGPTWorkflowNode[]) => FastGPTWorkflowNode[])
  ) => void;
  onNodesChange: (changes: NodeChange<FastGPTWorkflowNode>[]) => void;
  updateNodeData: (
    nodeId: string,
    updater: Partial<FlowNodeItemType> | ((prevData: FlowNodeItemType) => Partial<FlowNodeItemType>)
  ) => void;
  getNodeById: (
    nodeId: string | null | undefined,
    condition?: (node: FlowNodeItemType) => boolean
  ) => FlowNodeItemType | undefined;
  getRawNodeById: (nodeId: string | null | undefined) => FastGPTWorkflowNode | undefined;
  getNodeList: () => FlowNodeItemType[];
  getNodes: () => FastGPTWorkflowNode[];

  // === Edge Slice ===
  edges: Edge[];
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  onConnect: (connection: Connection) => void;
  hoverEdgeId: string | undefined;
  setHoverEdgeId: (id: string | undefined) => void;
  hoverNodeId: string | undefined;
  setHoverNodeId: (id: string | undefined) => void;

  // === UI & Interaction Slice ===
  workflowControlMode: 'drag' | 'select';
  setWorkflowControlMode: (mode: 'drag' | 'select') => void;
  menu: { top: number; left: number } | null;
  setMenu: (menu: { top: number; left: number } | null) => void;
  presentationMode: boolean;
  setPresentationMode: (mode: boolean) => void;

  // === History / Snapshot Slice ===
  past: WorkflowSnapshotsType[];
  setPast: (
    past: WorkflowSnapshotsType[] | ((prev: WorkflowSnapshotsType[]) => WorkflowSnapshotsType[])
  ) => void;
  future: WorkflowSnapshotsType[];
  setFuture: (
    future: WorkflowSnapshotsType[] | ((prev: WorkflowSnapshotsType[]) => WorkflowSnapshotsType[])
  ) => void;
  forbiddenSaveSnapshot: { current: boolean };
  pushPastSnapshot: (params: {
    pastNodes: FastGPTWorkflowNode[];
    pastEdges: Edge[];
    chatConfig: AppChatConfigType;
    customTitle?: string;
    isSaved?: boolean;
  }) => boolean;
  undo: (resetCallback?: (snapshot: WorkflowStateType) => void) => void;
  redo: (resetCallback?: (snapshot: WorkflowStateType) => void) => void;
  resetSnapshot: (state: WorkflowStateType) => void;

  // === Init / Reset ===
  initWorkflowStore: (params: {
    nodes?: FastGPTWorkflowNode[];
    edges?: Edge[];
    basicNodeTemplates?: FlowNodeTemplateType[];
  }) => void;
  resetWorkflowStore: () => void;
};

const initialStoreState = {
  nodes: [] as FastGPTWorkflowNode[],
  basicNodeTemplates: [] as FlowNodeTemplateType[],
  edges: [] as Edge[],
  hoverEdgeId: undefined as string | undefined,
  hoverNodeId: undefined as string | undefined,
  workflowControlMode: 'drag' as const,
  menu: null as { top: number; left: number } | null,
  presentationMode: false,
  past: [] as WorkflowSnapshotsType[],
  future: [] as WorkflowSnapshotsType[],
  forbiddenSaveSnapshot: { current: false }
};

/**
 * FastGPT 工作流核心状态管理 Store (Zustand)
 * 统一收敛节点 (Node)、连线 (Edge)、高频交互 (UI)、撤销重做 (History/Snapshot) 及弹窗 (Modal) 切片，
 * 取代历史多层 React Context 与渲染期深比较，支持原子化 Selector 订阅。
 */
export const useWorkflowStore = create<WorkflowStoreState>((set, get) => ({
  ...initialStoreState,

  // Node Slice
  setNodes: (nodesOrFn) => {
    set((state) => {
      const nextNodes = typeof nodesOrFn === 'function' ? nodesOrFn(state.nodes) : nodesOrFn;
      if (nextNodes === state.nodes) return state;
      const syncedNodes = syncParentNodesZIndex(nextNodes);
      const syncedEdges = syncEdgesZIndex(state.edges, syncedNodes);
      if (syncedNodes === state.nodes && syncedEdges === state.edges) return state;
      return {
        nodes: syncedNodes,
        ...(syncedEdges !== state.edges ? { edges: syncedEdges } : {})
      };
    });
  },

  onNodesChange: (changes) => {
    set((state) => {
      const nextNodes = applyNodeChanges<FastGPTWorkflowNode>(changes, state.nodes);
      if (nextNodes === state.nodes) return state;
      const syncedNodes = syncParentNodesZIndex(nextNodes);
      const syncedEdges = syncEdgesZIndex(state.edges, syncedNodes);
      if (syncedNodes === state.nodes && syncedEdges === state.edges) return state;
      return {
        nodes: syncedNodes,
        ...(syncedEdges !== state.edges ? { edges: syncedEdges } : {})
      };
    });
  },

  updateNodeData: (nodeId, updater) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId && node.data.nodeId !== nodeId) return node;
        const patch = typeof updater === 'function' ? updater(node.data) : updater;
        return {
          ...node,
          data: {
            ...node.data,
            ...patch
          }
        };
      })
    }));
  },

  getNodeById: (nodeId, condition) => {
    if (!nodeId) return undefined;
    const node = get().nodes.find((n) => n.id === nodeId || n.data.nodeId === nodeId);
    if (!node) return undefined;
    if (condition) {
      return condition(node.data) ? node.data : undefined;
    }
    return node.data;
  },

  getRawNodeById: (nodeId) => {
    if (!nodeId) return undefined;
    return get().nodes.find((n) => n.id === nodeId || n.data.nodeId === nodeId);
  },

  getNodeList: () => get().nodes.map((n) => n.data),
  getNodes: () => get().nodes,

  // Edge Slice
  setEdges: (edgesOrFn) => {
    set((state) => {
      const nextEdges = typeof edgesOrFn === 'function' ? edgesOrFn(state.edges) : edgesOrFn;
      if (nextEdges === state.edges) return state;
      const syncedEdges = syncEdgesZIndex(nextEdges, state.nodes);
      if (syncedEdges === state.edges) return state;
      return { edges: syncedEdges };
    });
  },

  onEdgesChange: (changes) => {
    set((state) => {
      const nextEdges = applyEdgeChanges<Edge>(changes, state.edges);
      if (nextEdges === state.edges) return state;
      const syncedEdges = syncEdgesZIndex(nextEdges, state.nodes);
      if (syncedEdges === state.edges) return state;
      return { edges: syncedEdges };
    });
  },

  onConnect: (connection) => {
    set((state) => {
      const nextEdges = addEdge<Edge>({ ...connection, type: EDGE_TYPE }, state.edges);
      const syncedEdges = syncEdgesZIndex(nextEdges, state.nodes);
      return { edges: syncedEdges };
    });
  },

  setHoverEdgeId: (id) => set({ hoverEdgeId: id }),
  setHoverNodeId: (id) => set({ hoverNodeId: id }),

  // UI Slice
  setWorkflowControlMode: (mode) => set({ workflowControlMode: mode }),
  setMenu: (menu) => set({ menu }),
  setPresentationMode: (presentationMode) => set({ presentationMode }),

  // History Slice
  setPast: (pastOrFn) => {
    set((state) => ({
      past: typeof pastOrFn === 'function' ? pastOrFn(state.past) : pastOrFn
    }));
  },

  setFuture: (futureOrFn) => {
    set((state) => ({
      future: typeof futureOrFn === 'function' ? futureOrFn(state.future) : futureOrFn
    }));
  },

  resetSnapshot: (state) => {
    set({
      nodes: state.nodes,
      edges: state.edges
    });
  },

  pushPastSnapshot: ({ pastNodes, pastEdges, chatConfig, customTitle, isSaved }) => {
    if (!pastNodes || !pastEdges || !chatConfig) return false;

    const { past, forbiddenSaveSnapshot } = get();

    if (forbiddenSaveSnapshot.current) {
      forbiddenSaveSnapshot.current = false;
      return false;
    }

    const isPastEqual = compareSnapshot(
      {
        nodes: pastNodes,
        edges: pastEdges,
        chatConfig
      },
      {
        nodes: past[0]?.nodes,
        edges: past[0]?.edges,
        chatConfig: past[0]?.chatConfig
      }
    );

    if (isPastEqual) return false;

    const newSnapshot: WorkflowSnapshotsType = {
      nodes: pastNodes,
      edges: pastEdges,
      title: customTitle || formatTime2YMDHMS(new Date()),
      chatConfig,
      isSaved
    };

    set((state) => {
      let nextPast: WorkflowSnapshotsType[];
      if (state.past.length === 0) {
        nextPast = [newSnapshot];
      } else {
        const initialSnapshot = state.past[state.past.length - 1];
        if (state.past.length < maxSnapshots) {
          nextPast = [newSnapshot, ...state.past];
        } else {
          nextPast = [
            newSnapshot,
            ...state.past.slice(0, -1).slice(0, maxSnapshots - 2),
            initialSnapshot
          ];
        }
      }

      return {
        future: [],
        past: nextPast
      };
    });

    return true;
  },

  undo: (resetCallback) => {
    const { past, forbiddenSaveSnapshot } = get();
    if (past.length > 1) {
      forbiddenSaveSnapshot.current = true;
      const targetSnapshot = past[1];
      set((state) => ({
        nodes: targetSnapshot.nodes,
        edges: targetSnapshot.edges,
        future: [state.past[0], ...state.future],
        past: state.past.slice(1)
      }));
      resetCallback?.(targetSnapshot);
    }
  },

  redo: (resetCallback) => {
    const { future, forbiddenSaveSnapshot } = get();
    if (future.length > 0) {
      forbiddenSaveSnapshot.current = true;
      const targetSnapshot = future[0];
      set((state) => ({
        nodes: targetSnapshot.nodes,
        edges: targetSnapshot.edges,
        past: [targetSnapshot, ...state.past],
        future: state.future.slice(1)
      }));
      resetCallback?.(targetSnapshot);
    }
  },

  // Init / Reset
  initWorkflowStore: ({ nodes, edges, basicNodeTemplates }) => {
    set((state) => {
      const nextNodes = syncParentNodesZIndex(nodes ?? state.nodes);
      const nextEdges = syncEdgesZIndex(edges ?? state.edges, nextNodes);
      return {
        nodes: nextNodes,
        edges: nextEdges,
        basicNodeTemplates: basicNodeTemplates ?? state.basicNodeTemplates
      };
    });
  },

  resetWorkflowStore: () => {
    set({ ...initialStoreState, forbiddenSaveSnapshot: { current: false } });
  }
}));
