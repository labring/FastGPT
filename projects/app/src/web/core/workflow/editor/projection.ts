// Runtime snapshot -> ReactFlow renderer projection.
// 画布节点 = Runtime Node Data（入站边界已完成 Template Materialization，ADR 0001）
// + 模板展示字段（不进文档，按 flowNodeType 浅合并回来）
// + Node View State（位置/折叠）
// + host 标红焦点
// + host 视图 overlay（debugResult/searchedText/教程元信息）
// + renderer 交互状态（选中、拖拽、测量尺寸、层级，从本地数组保留）。
// 问题文案不进画布数组：节点组件直接读 Runtime snapshot 的 issues。
import { omit, pick } from 'lodash-es';
import type { Edge } from 'reactflow';
import { EDGE_TYPE, type FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { EmptyNode } from '@fastgpt/global/core/workflow/template/system/emptyNode';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/node';
import type {
  WorkflowNodeSnapshot,
  WorkflowNodeViewSnapshot,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import {
  encodeRuntimeEdgeId,
  normalizeEdgeHandles,
  type CanvasNode,
  type ViewDataKey
} from '@/web/core/workflow/editor/canvas';

/** host 持有的按节点视图数据（不进文档）。 */
export type ViewDataOverlayMap = Record<string, Partial<Record<ViewDataKey, unknown>>>;

/**
 * 模板展示字段目录：showSourceHandle / unique / forbidDelete / hasToolInput 等只属于模板，
 * canonical 文档不携带（StoreNodeItemTypeSchema 会剥掉），投影时按 flowNodeType 浅合并回来。
 * 模板目录是静态常量；同类型取首个匹配，与旧物化路径的 find 语义一致。
 */
const templateByNodeType = new Map<FlowNodeTypeEnum, FlowNodeTemplateType>();
moduleTemplatesFlat.forEach((template) => {
  if (!templateByNodeType.has(template.flowNodeType)) {
    templateByNodeType.set(template.flowNodeType, template);
  }
});

type NodeCacheEntry = {
  snapshot: WorkflowNodeSnapshot;
  structureKey: string;
  view: WorkflowNodeViewSnapshot | undefined;
  overlay: Partial<Record<ViewDataKey, unknown>> | undefined;
  isError: boolean;
  selected: boolean | undefined;
  dragging: boolean | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
  zIndex: number | undefined;
  posX: number;
  posY: number;
  node: CanvasNode;
};

type EdgeCacheEntry = {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  zIndex: number | undefined;
  selected: boolean | undefined;
  edge: Edge<any>;
};

export type ProjectionCache = {
  nodes: Map<string, NodeCacheEntry>;
  edges: Map<string, EdgeCacheEntry>;
};

export const createProjectionCache = (): ProjectionCache => ({
  nodes: new Map(),
  edges: new Map()
});

/** 交互字段只在本地数组上维护；重投影时按 id 保留，避免手势中被 runtime 值覆盖。 */
const INTERACTION_FIELDS = ['selected', 'dragging', 'width', 'height', 'measured'] as const;

/** 字段值和 Issue 由 scoped field/issue 订阅承载，不改变节点外壳的缓存身份。 */
const getNodeStructureKey = (snapshot: WorkflowNodeSnapshot) => {
  const { inputs, outputs, issues: _issues, ...nodeMetadata } = snapshot;
  return JSON.stringify({
    ...nodeMetadata,
    inputs: inputs.map(({ value: _value, ...metadata }) => metadata),
    outputs: outputs.map(({ value: _value, ...metadata }) => metadata)
  });
};

/**
 * 把 Runtime 当前状态投影成画布数组。
 * 带按节点缓存：runtime snapshot / view / overlay / 交互值都没变的节点复用同一对象，
 * 保证 reactflow 与节点组件不因重投影而无谓重渲染。
 * 注意：只能使用 getWorkflow/getNode/getNodeView（有版本缓存），
 * 不能用 getWorkflowData()（每次全量深拷贝）。
 */
export const projectRuntimeCanvas = ({
  runtime,
  overlays,
  errorNodeId,
  localNodes,
  localEdges,
  cache
}: {
  runtime: WorkflowRuntimePort;
  overlays: ViewDataOverlayMap;
  /** host 问题焦点节点：该节点标红并强制选中，其余节点还原本地选中态。 */
  errorNodeId?: string;
  localNodes: CanvasNode[];
  localEdges: Edge<any>[];
  cache: ProjectionCache;
}): { nodes: CanvasNode[]; edges: Edge<any>[] } => {
  const workflow = runtime.getWorkflow();
  const localNodeById = new Map(localNodes.map((node) => [node.id, node]));

  const nodes = workflow.nodes.map((snapshot) => {
    const nodeId = snapshot.nodeId;
    const view = runtime.getNodeView(nodeId);
    const overlay = overlays[nodeId];
    const isError = errorNodeId === nodeId;
    const local = localNodeById.get(nodeId);
    const selected = local?.selected;
    const dragging = local?.dragging;
    // 拖拽中的位置以本地为准：几何要等手势结束才提交给 Runtime。
    const position = dragging && local ? local.position : (view?.position ?? { x: 0, y: 0 });
    const zIndex = snapshot.parentNodeId ? 1001 : undefined;
    const width = local?.width;
    const height = local?.height;
    const structureKey = getNodeStructureKey(snapshot);

    const cached = cache.nodes.get(nodeId);
    if (
      cached &&
      cached.structureKey === structureKey &&
      cached.view === view &&
      cached.overlay === overlay &&
      cached.isError === isError &&
      cached.selected === selected &&
      cached.dragging === dragging &&
      cached.width === width &&
      cached.height === height &&
      cached.zIndex === zIndex &&
      cached.posX === position.x &&
      cached.posY === position.y
    ) {
      // 保留最新 snapshot，下一次 metadata 变化必须与当前基线比较。
      cached.snapshot = snapshot;
      return cached.node;
    }

    // Issue View 只留在 Runtime snapshot 上：节点组件直接读文档，画布数组不承载问题状态。
    const nodeData = omit(snapshot, 'issues');
    const node: CanvasNode = {
      id: nodeId,
      type: snapshot.flowNodeType,
      // 文档节点在入站边界已物化，语义字段形状与画布 data 一致；
      // 只读快照与模板展示字段浅合并后整体断言回画布形状。
      data: {
        ...(templateByNodeType.get(snapshot.flowNodeType) ?? EmptyNode),
        ...nodeData,
        // isFolded 存在 Node View 上（语义快照不含），投影时合并，否则折叠状态在画布上丢失。
        isFolded: view?.isFolded,
        ...overlay,
        ...(isError ? { isError: true } : {})
      } as unknown as FlowNodeItemType,
      position,
      selected,
      zIndex,
      ...(local ? pick(local, [...INTERACTION_FIELDS]) : {}),
      // 标红焦点节点保持选中：与旧 onUpdateNodeError 一致，定位后无需再点一次即可操作该节点。
      ...(isError ? { selected: true } : {})
    };

    cache.nodes.set(nodeId, {
      snapshot,
      structureKey,
      view,
      overlay,
      isError,
      selected,
      dragging,
      width,
      height,
      zIndex,
      posX: position.x,
      posY: position.y,
      node
    });
    return node;
  });

  const aliveNodeIds = new Set(nodes.map((node) => node.id));
  cache.nodes.forEach((_, nodeId) => {
    if (!aliveNodeIds.has(nodeId)) cache.nodes.delete(nodeId);
  });

  const childNodeIds = new Set(
    workflow.nodes.filter((node) => node.parentNodeId).map((node) => node.nodeId)
  );
  const localEdgeById = new Map(localEdges.map((edge) => [edge.id, edge]));

  const edges = workflow.edges.map((edge, index) => {
    const id = encodeRuntimeEdgeId(index);
    const { sourceHandle, targetHandle } = normalizeEdgeHandles(edge);
    const zIndex = childNodeIds.has(edge.source) ? 1001 : undefined;
    const selected = localEdgeById.get(id)?.selected;

    const cached = cache.edges.get(id);
    if (
      cached &&
      cached.source === edge.source &&
      cached.target === edge.target &&
      cached.sourceHandle === sourceHandle &&
      cached.targetHandle === targetHandle &&
      cached.zIndex === zIndex &&
      cached.selected === selected
    ) {
      return cached.edge;
    }

    const next: Edge<any> = {
      id,
      source: edge.source,
      target: edge.target,
      sourceHandle,
      targetHandle,
      type: EDGE_TYPE,
      ...(selected !== undefined ? { selected } : {}),
      ...(zIndex !== undefined ? { zIndex } : {})
    };
    cache.edges.set(id, {
      source: edge.source,
      target: edge.target,
      sourceHandle,
      targetHandle,
      zIndex,
      selected,
      edge: next
    });
    return next;
  });

  // 删除边会使后续 wfedge-N 下标整体前移，缓存按 id 命中不了新值时重建即可，但要清掉越界 id。
  if (cache.edges.size > edges.length) {
    for (let i = edges.length; ; i++) {
      const id = encodeRuntimeEdgeId(i);
      if (!cache.edges.delete(id)) break;
    }
  }

  return { nodes, edges };
};
