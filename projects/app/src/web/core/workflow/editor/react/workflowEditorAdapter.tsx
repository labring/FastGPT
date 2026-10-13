import type {
  DeepReadonly,
  PlacementRequest,
  WorkflowDispatchResult,
  WorkflowFieldQuery,
  WorkflowCommand,
  WorkflowNodeData,
  WorkflowNodeSnapshot,
  WorkflowRuntimePort,
  WorkflowReferenceOptionsQuery,
  WorkflowReferenceOption,
  WorkflowGraphQueries,
  WorkflowActionsHandle as RuntimeWorkflowActionsHandle,
  WorkflowFieldHandle as RuntimeWorkflowFieldHandle,
  WorkflowGeometryUpdate as RuntimeWorkflowGeometryUpdate,
  WorkflowNodeActions as RuntimeWorkflowNodeActions,
  WorkflowNodeHandle as RuntimeWorkflowNodeHandle,
  WorkflowNodeUpdateOptions as RuntimeWorkflowNodeUpdateOptions,
  WorkflowStructureCommands as RuntimeWorkflowStructureCommands,
  WorkflowStructureHandle as RuntimeWorkflowStructureHandle,
  WorkflowStructureSnapshot as RuntimeWorkflowStructureSnapshot
} from '@fastgpt/global/core/workflow/editor/types';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type {
  NodeTemplateContext,
  StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';

// region adapterContracts React adapter public contracts

export type WorkflowStructureSnapshot = RuntimeWorkflowStructureSnapshot;
export type WorkflowGeometryUpdate = RuntimeWorkflowGeometryUpdate;
export type WorkflowNodeHandle = RuntimeWorkflowNodeHandle;
export type WorkflowNodeActions = RuntimeWorkflowNodeActions;
export type WorkflowNodeUpdateOptions = RuntimeWorkflowNodeUpdateOptions;
export type WorkflowStructureCommands = RuntimeWorkflowStructureCommands;
export type WorkflowStructureHandle = RuntimeWorkflowStructureHandle;
export type WorkflowActionsHandle = RuntimeWorkflowActionsHandle;
export type WorkflowFieldHandle = RuntimeWorkflowFieldHandle;

type WorkflowDisconnectEdge = Omit<Extract<WorkflowCommand, { type: 'disconnectEdge' }>, 'type'>;

export type WorkflowCanvasHandle = {
  commitGeometry: (updates: readonly WorkflowGeometryUpdate[]) => WorkflowDispatchResult;
};

// endregion

type Listener = () => void;

// region adapterContracts React adapter public contracts

export type WorkflowEditorAdapter = {
  connect: () => void;
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
  dispose: () => void;
};

// endregion

// region adapterImplementation React adapter runtime bridge

/**
 * 将 host-owned runtime 接入 React external store；adapter 释放自身订阅，生命周期不管理 runtime。
 */
export const createWorkflowEditorAdapter = (
  runtime: WorkflowRuntimePort,
  subscribeImmediately = true
): WorkflowEditorAdapter => {
  let disposed = false;
  void subscribeImmediately;

  const fallbackActions: WorkflowActionsHandle = Object.freeze({
    addNode: (node: StoreNodeItemType) => runtime.dispatch({ type: 'addNode', node }),
    addNodes: (nodes: readonly StoreNodeItemType[], edge?: StoreEdgeItemType) =>
      runtime.dispatch([
        ...nodes.map((node) => ({ type: 'addNode' as const, node })),
        ...(edge ? [{ type: 'connectEdge' as const, edge }] : [])
      ]),
    connectEdge: (edge: StoreEdgeItemType) => runtime.dispatch({ type: 'connectEdge', edge }),
    disconnectEdge: (command: WorkflowDisconnectEdge) =>
      runtime.dispatch({ type: 'disconnectEdge', ...command }),
    disconnectEdges: (commands: readonly WorkflowDisconnectEdge[]) =>
      runtime.dispatch(
        commands.map((command) => ({ type: 'disconnectEdge' as const, ...command }))
      ),
    removeNodes: (nodeIds: readonly string[]) =>
      runtime.dispatch({ type: 'removeNodes', nodeIds: [...nodeIds] }),
    attachToContainer: (nodeId: string, containerId: string) =>
      runtime.dispatch({ type: 'attachToContainer', nodeId, containerId }),
    commitGeometry: (updates) =>
      runtime.dispatch(
        updates.map(({ nodeId, position, isFolded }) => ({
          type: 'commitGeometry' as const,
          nodeId,
          ...(position ? { position: { x: position.x, y: position.y } } : {}),
          ...(isFolded !== undefined ? { isFolded } : {})
        }))
      ),
    getWorkflowSnapshot: () => getStructureSnapshot(),
    getEdges: () => getStructureSnapshot().edges
  });

  const getStructureSnapshot = (): WorkflowStructureSnapshot => {
    if (disposed) return { nodes: [], edges: [] };
    if (runtime.getStructureSnapshot) return runtime.getStructureSnapshot();
    const workflow = runtime.getWorkflow();
    return Object.freeze({
      nodes: Object.freeze(
        workflow.nodes.map((node) =>
          Object.freeze({
            nodeId: node.nodeId,
            ...(node.parentNodeId !== undefined ? { parentNodeId: node.parentNodeId } : {})
          })
        )
      ),
      edges: workflow.edges
    }) as WorkflowStructureSnapshot;
  };

  const getNodeSnapshot = (nodeId: string): WorkflowNodeHandle | undefined => {
    if (disposed) return undefined;
    if (runtime.getNodeHandle) return runtime.getNodeHandle(nodeId);
    const data = runtime.getNode(nodeId);
    const view = runtime.getNodeView(nodeId);
    if (!data || !view) return undefined;
    return Object.freeze({
      data,
      view,
      setName: (name: string) => runtime.dispatch({ type: 'updateNode', nodeId, patch: { name } }),
      setFolded: (isFolded: boolean) =>
        runtime.dispatch({ type: 'commitGeometry', nodeId, isFolded }),
      updateNode: (
        patch: (node: WorkflowNodeSnapshot) => Partial<DeepReadonly<WorkflowNodeData>>,
        options?: WorkflowNodeUpdateOptions
      ) => {
        const current = runtime.getNode(nodeId);
        const resolved = current ? patch(current) : {};
        return runtime.dispatch([
          ...(options?.disconnectEdges?.map((command) => ({
            type: 'disconnectEdge' as const,
            ...command
          })) ?? []),
          { type: 'updateNode', nodeId, patch: resolved as Partial<WorkflowNodeData> }
        ]);
      }
    });
  };

  const getNodeActions = (nodeId: string): WorkflowNodeActions | undefined => {
    if (disposed) return undefined;
    if (runtime.getNodeActions) return runtime.getNodeActions(nodeId);
    const handle = getNodeSnapshot(nodeId);
    return handle
      ? { setName: handle.setName, setFolded: handle.setFolded, updateNode: handle.updateNode }
      : undefined;
  };

  const getFieldSnapshot = (query: WorkflowFieldQuery): WorkflowFieldHandle | undefined => {
    if (disposed) return undefined;
    if (runtime.getFieldHandle) return runtime.getFieldHandle(query);
    const data = runtime.getField(query);
    if (!data) return undefined;
    return Object.freeze({
      data,
      reference: data.references,
      setValue: (value: unknown) =>
        runtime.dispatch({
          type: 'updateField',
          nodeId: data.nodeId,
          fieldKey: data.key,
          kind: data.kind,
          value
        })
    });
  };

  // 旧 Port 没有 scoped subscriptions；仅为旧测试/外部 mock 合并它唯一的 issue 通道。
  const legacyIssueListeners = new Set<Listener>();
  let unsubscribeLegacyIssues: (() => void) | undefined;
  const subscribeLegacyIssues = (listener: Listener) => {
    if (!runtime.subscribeIssues) return () => undefined;
    legacyIssueListeners.add(listener);
    unsubscribeLegacyIssues ??= runtime.subscribeIssues(() => {
      [...legacyIssueListeners].forEach((legacyListener) => legacyListener());
    });
    return () => {
      legacyIssueListeners.delete(listener);
      if (legacyIssueListeners.size === 0) {
        unsubscribeLegacyIssues?.();
        unsubscribeLegacyIssues = undefined;
      }
    };
  };

  const subscribeWithFallback = (
    subscribeRuntime: ((listener: Listener) => () => void) | undefined,
    listener: Listener,
    includeIssues: boolean
  ) => {
    if (disposed) return () => undefined;
    const unsubscribeRuntime = subscribeRuntime
      ? subscribeRuntime(listener)
      : runtime.subscribe(() => listener());
    const unsubscribeIssues =
      !subscribeRuntime && includeIssues ? subscribeLegacyIssues(listener) : undefined;
    return () => {
      unsubscribeRuntime();
      unsubscribeIssues?.();
    };
  };

  const workflowActions = runtime.getWorkflowActions?.() ?? fallbackActions;
  const canvasHandle: WorkflowCanvasHandle = Object.freeze({
    commitGeometry: workflowActions.commitGeometry
  });
  let workflowHandleSnapshot: WorkflowStructureSnapshot | undefined;
  let workflowHandle: WorkflowStructureHandle | undefined;

  const getWorkflowSnapshot = (): WorkflowStructureHandle => {
    const structure = getStructureSnapshot();
    if (workflowHandle && workflowHandleSnapshot === structure) return workflowHandle;
    workflowHandleSnapshot = structure;
    workflowHandle = Object.freeze({ ...structure, ...workflowActions });
    return workflowHandle;
  };

  return {
    connect: () => undefined,
    getWorkflowSnapshot,
    subscribeWorkflow: (listener) =>
      subscribeWithFallback(runtime.subscribeWorkflow, listener, false),
    getNodeSnapshot,
    getNodeActions,
    subscribeNode: (nodeId, listener) =>
      subscribeWithFallback(
        runtime.subscribeNode ? (callback) => runtime.subscribeNode!(nodeId, callback) : undefined,
        listener,
        true
      ),
    getFieldSnapshot,
    subscribeField: (query, listener) =>
      subscribeWithFallback(
        runtime.subscribeField ? (callback) => runtime.subscribeField!(query, callback) : undefined,
        listener,
        true
      ),
    getReferenceOptions: (query) => runtime.getReferenceOptions(query),
    subscribeReferenceOptions: (listener) =>
      subscribeWithFallback(
        runtime.subscribeReferenceOptions
          ? (callback) => runtime.subscribeReferenceOptions!(callback)
          : undefined,
        listener,
        true
      ),
    getCanvasHandle: () => canvasHandle,
    getStructureSnapshot,
    getGraphQueries: () => runtime.getGraphQueries(),
    getWorkflowActions: () => workflowActions,
    getPlacementContext: (request) => (disposed ? null : runtime.getPlacementContext(request)),
    dispose: () => {
      disposed = true;
    }
  };
};

// endregion
