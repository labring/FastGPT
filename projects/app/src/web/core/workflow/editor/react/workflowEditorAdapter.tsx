import type {
  PlacementRequest,
  WorkflowActionsHandle,
  WorkflowDispatchResult,
  WorkflowFieldHandle,
  WorkflowFieldQuery,
  WorkflowGeometryUpdate,
  WorkflowGraphQueries,
  WorkflowNodeActions,
  WorkflowNodeHandle,
  WorkflowReferenceOption,
  WorkflowReferenceOptionsQuery,
  WorkflowRuntimePort,
  WorkflowStructureHandle,
  WorkflowStructureSnapshot
} from '@fastgpt/global/core/workflow/editor/types';
import type { NodeTemplateContext } from '@fastgpt/global/core/workflow/type/node';

export type WorkflowCanvasHandle = {
  commitGeometry: (updates: readonly WorkflowGeometryUpdate[]) => WorkflowDispatchResult;
};

type Listener = () => void;
const EMPTY_STRUCTURE_SNAPSHOT = Object.freeze({
  nodes: Object.freeze([]),
  edges: Object.freeze([])
}) as WorkflowStructureSnapshot;
const EMPTY_REFERENCE_OPTIONS = Object.freeze([]) as readonly WorkflowReferenceOption[];

export type WorkflowEditorAdapter = {
  getWorkflowSnapshot: () => WorkflowStructureHandle;
  subscribeWorkflow: (listener: Listener) => () => void;
  getNodeSnapshot: (nodeId: string) => WorkflowNodeHandle | undefined;
  getNodeActions: (nodeId: string) => WorkflowNodeActions | undefined;
  subscribeNode: (nodeId: string, listener: Listener) => () => void;
  getFieldSnapshot: (query: WorkflowFieldQuery) => WorkflowFieldHandle | undefined;
  subscribeField: (query: WorkflowFieldQuery, listener: Listener) => () => void;
  getReferenceOptions: (query: WorkflowReferenceOptionsQuery) => readonly WorkflowReferenceOption[];
  subscribeReferenceOptions: (listener: Listener) => () => void;
  getCanvasHandle: () => WorkflowCanvasHandle;
  /** 非订阅读取当前结构快照；value hook 与稳定 action 句柄共用同一个来源。 */
  getStructureSnapshot: () => WorkflowStructureSnapshot;
  /** Runtime 图查询对象；身份在 runtime 生命周期内不变，可直接当 selector 入参与 memo 依赖。 */
  getGraphQueries: () => WorkflowGraphQueries;
  /** 稳定 action 句柄：身份不随结构变化，只用写能力的消费点订阅数为零。 */
  getWorkflowActions: () => WorkflowActionsHandle;
  /** 按当前 Document 派生 placement context；模板目录、落点与连线判定共用同一份规则输入。 */
  getPlacementContext: (request: PlacementRequest) => NodeTemplateContext | null;
};

/** 将 Runtime 的 scoped store 接入 React；订阅由各 hook 自己清理。 */
export const createWorkflowEditorAdapter = (
  runtime: WorkflowRuntimePort
): WorkflowEditorAdapter => {
  const workflowActions = runtime.getWorkflowActions();
  const canvasHandle: WorkflowCanvasHandle = Object.freeze({
    commitGeometry: workflowActions.commitGeometry
  });
  let workflowHandleSnapshot: WorkflowStructureSnapshot | undefined;
  let workflowHandle: WorkflowStructureHandle | undefined;

  const getStructureSnapshot = () =>
    runtime.isDisposed() ? EMPTY_STRUCTURE_SNAPSHOT : runtime.getStructureSnapshot();

  return {
    getWorkflowSnapshot: () => {
      const structure = getStructureSnapshot();
      if (workflowHandle && workflowHandleSnapshot === structure) return workflowHandle;
      workflowHandleSnapshot = structure;
      workflowHandle = Object.freeze({ ...structure, ...workflowActions });
      return workflowHandle;
    },
    subscribeWorkflow: runtime.subscribeWorkflow,
    getNodeSnapshot: (nodeId) => (runtime.isDisposed() ? undefined : runtime.getNodeHandle(nodeId)),
    getNodeActions: runtime.getNodeActions,
    subscribeNode: runtime.subscribeNode,
    getFieldSnapshot: (query) => (runtime.isDisposed() ? undefined : runtime.getFieldHandle(query)),
    subscribeField: runtime.subscribeField,
    getReferenceOptions: (query) =>
      runtime.isDisposed() ? EMPTY_REFERENCE_OPTIONS : runtime.getReferenceOptions(query),
    subscribeReferenceOptions: runtime.subscribeReferenceOptions,
    getCanvasHandle: () => canvasHandle,
    getStructureSnapshot,
    getGraphQueries: runtime.getGraphQueries,
    getWorkflowActions: () => workflowActions,
    getPlacementContext: runtime.getPlacementContext
  };
};
