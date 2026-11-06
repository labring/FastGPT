// ReactFlow projection helpers shared by the renderer and adapter boundaries.
import { omit } from 'lodash-es';
import type { Node, NodeProps } from '@xyflow/react';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { StoreNodeItemTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { DeepReadonly } from '@fastgpt/global/core/workflow/editor/types';

export type ViewDataKey = 'debugResult' | 'searchedText' | 'courseUrl' | 'readmeUrl' | 'userGuide';

/** ReactFlow 投影数据：节点字段与问题、输入输出值由 scoped reader 提供。 */
export type CanvasNodeData<T extends FlowNodeTypeEnum = FlowNodeTypeEnum> = DeepReadonly<
  Omit<FlowNodeItemType, 'inputs' | 'outputs' | 'catchError' | 'issues' | 'flowNodeType'> & {
    flowNodeType: T;
  }
>;

type CanvasNodeMeasurement = {
  measured?: { width?: number; height?: number };
};

/** 画布状态边界使用宽类型，renderer 注册使用下面的按 type 辨识联合。 */
export type CanvasNode = Node<CanvasNodeData, FlowNodeTypeEnum> & CanvasNodeMeasurement;

export type CanvasNodeByType = {
  [T in FlowNodeTypeEnum]: Node<CanvasNodeData<T>, T> & CanvasNodeMeasurement;
};

export type CanvasNodeOf<T extends FlowNodeTypeEnum> = CanvasNodeByType[T];
export type WorkflowCanvasNode = CanvasNodeByType[keyof CanvasNodeByType];

type Mutable<T> = T extends readonly (infer U)[]
  ? number extends T['length']
    ? Mutable<U>[]
    : { -readonly [K in keyof T]: Mutable<T[K]> }
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;

/** v12 props 保留完整 Node 泛型；旧节点卡片仍接收可变 data 视图。 */
export type CanvasNodeProps<T extends WorkflowCanvasNode = WorkflowCanvasNode> = Omit<
  NodeProps<T>,
  'data'
> & {
  data: Mutable<T['data']>;
};

export type ViewOverlayData = Pick<CanvasNodeData, ViewDataKey>;

/**
 * 只属于画布视图的数据字段：不进文档，由 host overlay 持有并在投影时合并。
 * courseUrl/userGuide 是旧路径也从不持久化的展示元信息（保存白名单会剥离），
 * 归入视图字段避免 updateNode 时被 store schema 丢弃。
 * isError 不在此列：标红焦点由 host 持有、投影时合并；问题文案由节点组件读 Runtime snapshot。
 */

/** 单个节点的视图 overlay 变更。 */
export type ViewOverlayPatch = {
  nodeId: string;
  values: Partial<ViewOverlayData>;
};

/** 画布节点 -> 严格 store 节点：剥离视图字段与模板专用字段，保留 position/isFolded。 */
export const canvasNodeToStoreNode = (
  node: Node<FlowNodeItemType, FlowNodeTypeEnum>
): StoreNodeItemType =>
  StoreNodeItemTypeSchema.parse({
    ...omit(node.data, ['debugResult', 'searchedText', 'courseUrl', 'readmeUrl', 'userGuide']),
    position: node.position
  });

/** 归一化边的 handle；值匹配删除时必须对两边同时应用。 */
export const normalizeEdgeHandles = (edge: {
  sourceHandle?: string | null;
  targetHandle?: string | null;
}) => ({
  sourceHandle: (edge.sourceHandle ?? '').replace(/-source-(top|bottom|left)$/, '-source-right'),
  targetHandle: (edge.targetHandle ?? '').replace(/-target-(top|bottom|right)$/, '-target-left')
});
