import type {
  DeepReadonly,
  PlacementRequest,
  WorkflowChange,
  WorkflowDispatchResult,
  WorkflowEdgeSnapshot,
  WorkflowFieldIdentity,
  WorkflowFieldQuery,
  WorkflowFieldSnapshot,
  WorkflowCommand,
  WorkflowNodeData,
  WorkflowNodeSnapshot,
  WorkflowNodeViewSnapshot,
  WorkflowRuntimePort,
  WorkflowReferenceOptionsQuery,
  WorkflowReferenceOption,
  WorkflowSnapshot,
  WorkflowGraphQueries,
  WorkflowIssueUpdate
} from '@fastgpt/global/core/workflow/editor/types';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type {
  NodeTemplateContext,
  StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';

export type WorkflowNodeIdentity = {
  nodeId: string;
  parentNodeId?: string;
};

export type WorkflowStructureSnapshot = DeepReadonly<{
  nodes: WorkflowNodeIdentity[];
  edges: WorkflowEdgeSnapshot[];
}>;

export type WorkflowGeometryUpdate = {
  nodeId: string;
  position?: { x: number; y: number };
  isFolded?: boolean;
};

export type WorkflowNodeHandle = {
  data: WorkflowNodeSnapshot;
  view: WorkflowNodeViewSnapshot;
  setName: (name: string) => WorkflowDispatchResult;
  setFolded: (isFolded: boolean) => WorkflowDispatchResult;
  /**
   * 提交节点语义数据 patch（updateNode 命令），差异记录仍由 Runtime 按字段粒度发布。
   * 只接受函数形式：入参是派发瞬间的当前记录，返回值是只读快照形状的 patch。
   *
   * 记录级数组（inputs / outputs）必须基于这份当前记录整表拼装。拿渲染期快照当基线
   * 会覆盖掉同一 tick 内的其他写入，多行同时提交时互相丢改动。
   * 位置与折叠不在此提交（只走 commitGeometry）。
   */
  updateNode: (
    patch: (node: WorkflowNodeSnapshot) => Partial<DeepReadonly<WorkflowNodeData>>,
    options?: WorkflowNodeUpdateOptions
  ) => WorkflowDispatchResult;
};

export type WorkflowNodeActions = Pick<WorkflowNodeHandle, 'setName' | 'setFolded' | 'updateNode'>;

export type WorkflowFieldHandle = {
  data: WorkflowFieldSnapshot;
  reference: WorkflowFieldSnapshot['references'];
  setValue: (value: unknown) => WorkflowDispatchResult;
};

type WorkflowDisconnectEdge = Omit<Extract<WorkflowCommand, { type: 'disconnectEdge' }>, 'type'>;

export type WorkflowNodeUpdateOptions = {
  /**
   * 与 patch 同一事务断开的连线。
   * 删除或替换输出字段时旧 handle 上的连线必须一起消失；拆成两次 dispatch 会让撤销需要按两下。
   * index 需按降序给出：同一事务内逐条删除会改变后续下标。
   */
  disconnectEdges?: readonly WorkflowDisconnectEdge[];
};

/** 结构级写命令：`useWorkflow()` 的结构句柄与 `useWorkflowActions()` 的稳定句柄共用同一份签名。 */
export type WorkflowStructureCommands = {
  addNode: (node: StoreNodeItemType) => WorkflowDispatchResult;
  addNodes: (
    nodes: readonly StoreNodeItemType[],
    edge?: StoreEdgeItemType
  ) => WorkflowDispatchResult;
  connectEdge: (edge: StoreEdgeItemType) => WorkflowDispatchResult;
  disconnectEdge: (command: WorkflowDisconnectEdge) => WorkflowDispatchResult;
  disconnectEdges: (commands: readonly WorkflowDisconnectEdge[]) => WorkflowDispatchResult;
  removeNodes: (nodeIds: readonly string[]) => WorkflowDispatchResult;
  attachToContainer: (nodeId: string, containerId: string) => WorkflowDispatchResult;
};

export type WorkflowStructureHandle = WorkflowStructureSnapshot & WorkflowStructureCommands;

/**
 * 稳定的写能力句柄：只包 command 与非订阅 getter，不携带任何随结构变化的字段，
 * 因此对象身份在 adapter 生命周期内不变，使用它的组件对结构变更的订阅数为零。
 *
 * 两个 getter 都是「点击时读当前值」用的，不会让组件重渲染：
 * 结构快照身份随结构版本变化，边集合直接复用快照里的只读数组。
 */
export type WorkflowActionsHandle = WorkflowStructureCommands & {
  commitGeometry: (updates: readonly WorkflowGeometryUpdate[]) => WorkflowDispatchResult;
  /** 非订阅读取当前结构快照（节点 identity + 边集合）。 */
  getWorkflowSnapshot: () => WorkflowStructureSnapshot;
  /** 非订阅读取当前边集合，供只在事件回调里用边的消费点使用。 */
  getEdges: () => readonly WorkflowEdgeSnapshot[];
};

export type WorkflowCanvasHandle = {
  commitGeometry: (updates: readonly WorkflowGeometryUpdate[]) => WorkflowDispatchResult;
};

type Listener = () => void;
type ListenerRegistry = Map<string, Set<Listener>>;

const getFieldIdentityKey = ({ nodeId, key, kind }: WorkflowFieldIdentity) =>
  `${nodeId}\0${kind}\0${key}`;

const getFieldQueryKey = ({ nodeId, fieldKey, kind }: WorkflowFieldQuery) =>
  `${nodeId}\0${kind ?? '*'}\0${fieldKey}`;

const freezeStructure = (workflow: WorkflowSnapshot): WorkflowStructureSnapshot =>
  Object.freeze({
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

const structureEqual = (previous: WorkflowStructureSnapshot, next: WorkflowStructureSnapshot) => {
  if (previous.nodes.length !== next.nodes.length || previous.edges.length !== next.edges.length) {
    return false;
  }
  return (
    previous.nodes.every(
      (node, index) =>
        node.nodeId === next.nodes[index].nodeId &&
        node.parentNodeId === next.nodes[index].parentNodeId
    ) &&
    previous.edges.every((edge, index) => {
      const nextEdge = next.edges[index];
      return (
        edge.source === nextEdge.source &&
        edge.sourceHandle === nextEdge.sourceHandle &&
        edge.target === nextEdge.target &&
        edge.targetHandle === nextEdge.targetHandle
      );
    })
  );
};

const notify = (listeners: Set<Listener>) => {
  listeners.forEach((listener) => listener());
};

const collectRegistryListeners = (registry: ListenerRegistry, nodeIds: readonly string[]) => {
  const notified = new Set<Listener>();
  nodeIds.forEach((nodeId) => {
    registry.get(nodeId)?.forEach((listener) => notified.add(listener));
  });
  return notified;
};

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
  /** 文档内容版本：语义事务递增，几何提交与 issue 刷新不变。 */
  getDocumentVersion: () => number;
  dispose: () => void;
};

/**
 * 将 host-owned runtime 接入 React external store；adapter 释放自身订阅，生命周期不管理 runtime。
 */
export const createWorkflowEditorAdapter = (
  runtime: WorkflowRuntimePort,
  subscribeImmediately = true
): WorkflowEditorAdapter => {
  let disposed = false;
  let unsubscribeRuntime: (() => void) | undefined;
  let unsubscribeIssues: (() => void) | undefined;
  let structure = freezeStructure(runtime.getWorkflow());
  // port 返回的查询对象本身在 runtime 生命周期内身份不变，取一次即可当稳定引用透传。
  const graphQueries = runtime.getGraphQueries();
  const workflowActions = Object.freeze({
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
      runtime.dispatch({ type: 'attachToContainer', nodeId, containerId })
  });
  const getStructureSnapshot = (): WorkflowStructureSnapshot => structure;
  /** 批量 geometry 提交：canvas 句柄与稳定 action 句柄共用同一份实现。 */
  const commitGeometry = (updates: readonly WorkflowGeometryUpdate[]): WorkflowDispatchResult =>
    runtime.dispatch(
      updates.map(({ nodeId, position, isFolded }) => ({
        type: 'commitGeometry' as const,
        nodeId,
        ...(position ? { position: { x: position.x, y: position.y } } : {}),
        ...(isFolded !== undefined ? { isFolded } : {})
      }))
    );
  /**
   * 结构变化时只重建 `structure` 与 `workflowHandle`，本句柄不重建：
   * getter 读的是闭包里的 live binding，所以身份在 adapter 生命周期内恒定。
   */
  const actionsHandle: WorkflowActionsHandle = Object.freeze({
    ...workflowActions,
    commitGeometry,
    getWorkflowSnapshot: getStructureSnapshot,
    getEdges: () => structure.edges
  });
  const createWorkflowHandle = (snapshot: WorkflowStructureSnapshot): WorkflowStructureHandle =>
    Object.freeze({ ...snapshot, ...workflowActions });
  let workflowHandle = createWorkflowHandle(structure);
  const workflowListeners = new Set<Listener>();
  const referenceListeners = new Set<Listener>();
  const nodeDataListeners: ListenerRegistry = new Map();
  const nodeViewListeners: ListenerRegistry = new Map();
  const fieldListeners: ListenerRegistry = new Map();
  const nodeHandles = new Map<string, WorkflowNodeHandle>();
  const fieldHandles = new Map<string, WorkflowFieldHandle>();
  const setNameActions = new Map<string, WorkflowNodeHandle['setName']>();
  const setFoldedActions = new Map<string, WorkflowNodeHandle['setFolded']>();
  const updateNodeActions = new Map<string, WorkflowNodeHandle['updateNode']>();

  const subscribeRegistry = (registry: ListenerRegistry, nodeId: string, listener: Listener) => {
    const listeners = registry.get(nodeId) ?? new Set<Listener>();
    listeners.add(listener);
    registry.set(nodeId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) registry.delete(nodeId);
    };
  };

  const setFolded = (nodeId: string, isFolded: boolean): WorkflowDispatchResult =>
    runtime.dispatch({ type: 'commitGeometry', nodeId, isFolded });

  const setName = (nodeId: string, name: string): WorkflowDispatchResult =>
    runtime.dispatch({ type: 'updateNode', nodeId, patch: { name } });

  const updateNode = (
    nodeId: string,
    patch: (node: WorkflowNodeSnapshot) => Partial<DeepReadonly<WorkflowNodeData>>,
    options?: WorkflowNodeUpdateOptions
  ): WorkflowDispatchResult => {
    const disconnects = options?.disconnectEdges;
    // 派发瞬间读当前记录；节点已删除时提交空 patch，由 Runtime 报 not_found。
    const current = runtime.getNode(nodeId);
    const resolved = current ? patch(current) : {};
    // Runtime 会 clone patch，只读快照可以原样透传。
    return runtime.dispatch([
      ...(disconnects?.map((command) => ({ type: 'disconnectEdge' as const, ...command })) ?? []),
      { type: 'updateNode', nodeId, patch: resolved as Partial<WorkflowNodeData> }
    ]);
  };

  const getSetName = (nodeId: string) => {
    const previous = setNameActions.get(nodeId);
    if (previous) return previous;
    const action = (name: string) => setName(nodeId, name);
    setNameActions.set(nodeId, action);
    return action;
  };

  const getSetFolded = (nodeId: string) => {
    const previous = setFoldedActions.get(nodeId);
    if (previous) return previous;
    const action = (isFolded: boolean) => setFolded(nodeId, isFolded);
    setFoldedActions.set(nodeId, action);
    return action;
  };

  const getUpdateNode = (nodeId: string) => {
    const previous = updateNodeActions.get(nodeId);
    if (previous) return previous;
    const action = (
      patch: (node: WorkflowNodeSnapshot) => Partial<DeepReadonly<WorkflowNodeData>>,
      options?: WorkflowNodeUpdateOptions
    ) => updateNode(nodeId, patch, options);
    updateNodeActions.set(nodeId, action);
    return action;
  };

  /** 节点消失时一并丢弃句柄与缓存 action，避免删除后仍能被写。 */
  const dropNodeHandle = (nodeId: string) => {
    nodeHandles.delete(nodeId);
    setNameActions.delete(nodeId);
    setFoldedActions.delete(nodeId);
    updateNodeActions.delete(nodeId);
  };

  const getNodeSnapshot = (nodeId: string): WorkflowNodeHandle | undefined => {
    if (disposed) return undefined;
    const data = runtime.getNode(nodeId);
    const view = runtime.getNodeView(nodeId);
    if (!data || !view) {
      dropNodeHandle(nodeId);
      return undefined;
    }

    const previous = nodeHandles.get(nodeId);
    if (previous?.data === data && previous.view === view) return previous;

    const handle = {
      data,
      view,
      setName: getSetName(nodeId),
      setFolded: getSetFolded(nodeId),
      updateNode: getUpdateNode(nodeId)
    } satisfies WorkflowNodeHandle;
    nodeHandles.set(nodeId, handle);
    return handle;
  };

  const getNodeActions = (nodeId: string): WorkflowNodeActions | undefined => {
    if (disposed || !runtime.getNode(nodeId) || !runtime.getNodeView(nodeId)) {
      dropNodeHandle(nodeId);
      return undefined;
    }
    return {
      setName: getSetName(nodeId),
      setFolded: getSetFolded(nodeId),
      updateNode: getUpdateNode(nodeId)
    };
  };

  const setFieldValue = (identity: WorkflowFieldIdentity, value: unknown): WorkflowDispatchResult =>
    runtime.dispatch({
      type: 'updateField',
      nodeId: identity.nodeId,
      fieldKey: identity.key,
      kind: identity.kind,
      value
    });

  const getSetFieldValue = (identity: WorkflowFieldIdentity) => {
    const identityKey = getFieldIdentityKey(identity);
    const previous = fieldHandles.get(identityKey)?.setValue;
    if (previous) return previous;
    return (value: unknown) => setFieldValue(identity, value);
  };

  const getFieldSnapshot = (query: WorkflowFieldQuery): WorkflowFieldHandle | undefined => {
    if (disposed) return undefined;
    const data = runtime.getField(query);
    if (!data) {
      const kinds = query.kind ? [query.kind] : (['input', 'output'] as const);
      kinds.forEach((kind) => {
        const key = getFieldIdentityKey({ nodeId: query.nodeId, key: query.fieldKey, kind });
        fieldHandles.delete(key);
      });
      return undefined;
    }

    const identity = { nodeId: data.nodeId, key: data.key, kind: data.kind };
    const identityKey = getFieldIdentityKey(identity);
    const previous = fieldHandles.get(identityKey);
    if (previous?.data === data) return previous;

    const handle = Object.freeze({
      data,
      reference: data.references,
      setValue: getSetFieldValue(identity)
    });
    fieldHandles.set(identityKey, handle);
    return handle;
  };

  const collectFieldListeners = (identities: readonly WorkflowFieldIdentity[]) => {
    const listeners = new Set<Listener>();
    identities.forEach((identity) => {
      [
        getFieldIdentityKey(identity),
        getFieldQueryKey({ nodeId: identity.nodeId, fieldKey: identity.key })
      ].forEach((key) => fieldListeners.get(key)?.forEach((listener) => listeners.add(listener)));
    });
    return listeners;
  };

  const onRuntimeChange = (change: WorkflowChange) => {
    if (disposed) return;

    if (change.kind === 'geometry') {
      notify(collectRegistryListeners(nodeViewListeners, change.changedRecords.nodeViewIds));
      return;
    }

    const structureChanged = change.kind === 'replace' || change.affectedRecords.structure;
    if (structureChanged) {
      const nextStructure = freezeStructure(runtime.getWorkflow());
      if (!structureEqual(structure, nextStructure)) {
        structure = nextStructure;
        workflowHandle = createWorkflowHandle(structure);
      }
    }

    const nodeDataIds = new Set([
      ...change.changedRecords.nodeIds,
      ...change.affectedRecords.nodeIds,
      ...change.changedRecords.fieldIds.map((field) => field.nodeId),
      ...change.affectedRecords.fieldIds.map((field) => field.nodeId)
    ]);
    const dataListeners = collectRegistryListeners(nodeDataListeners, [...nodeDataIds]);
    const viewListeners = collectRegistryListeners(
      nodeViewListeners,
      change.changedRecords.nodeViewIds
    );
    const fieldListenersToNotify =
      change.kind === 'replace'
        ? new Set([...fieldListeners.values()].flatMap((listeners) => [...listeners]))
        : collectFieldListeners([
            ...change.changedRecords.fieldIds,
            ...change.affectedRecords.fieldIds
          ]);

    if (change.kind === 'replace') {
      [...nodeHandles.keys()].forEach((nodeId) => {
        if (!runtime.getNode(nodeId)) dropNodeHandle(nodeId);
      });
      fieldHandles.clear();
      collectRegistryListeners(nodeDataListeners, [...nodeDataListeners.keys()]).forEach(
        (listener) => dataListeners.add(listener)
      );
      collectRegistryListeners(nodeViewListeners, [...nodeViewListeners.keys()]).forEach(
        (listener) => viewListeners.add(listener)
      );
    } else {
      change.changedRecords.nodeIds.forEach((nodeId) => {
        if (!runtime.getNode(nodeId)) dropNodeHandle(nodeId);
      });
    }
    dataListeners.forEach((listener) => viewListeners.delete(listener));
    notify(dataListeners);
    notify(viewListeners);
    notify(fieldListenersToNotify);
    notify(referenceListeners);
    if (structureChanged) {
      notify(workflowListeners);
    }
  };

  /**
   * Issue-only 刷新不是 Workflow Change：结构、几何与字段都没变，
   * 只需要让订阅了这些节点的 hook 重新读取带 Unified Issue View 的 snapshot。
   */
  const onIssueUpdate = (update: WorkflowIssueUpdate) => {
    if (disposed) return;
    notify(collectRegistryListeners(nodeDataListeners, update.nodeIds));
  };

  const connect = () => {
    if (disposed || unsubscribeRuntime) return;
    unsubscribeRuntime = runtime.subscribe(onRuntimeChange);
    unsubscribeIssues = runtime.subscribeIssues(onIssueUpdate);
  };
  if (subscribeImmediately) connect();
  const canvasHandle: WorkflowCanvasHandle = Object.freeze({ commitGeometry });

  return {
    connect,
    getWorkflowSnapshot: () => workflowHandle,
    subscribeWorkflow: (listener) => {
      if (disposed) return () => undefined;
      connect();
      workflowListeners.add(listener);
      return () => workflowListeners.delete(listener);
    },
    getNodeSnapshot,
    getNodeActions,
    subscribeNode: (nodeId, listener) => {
      if (disposed) return () => undefined;
      connect();
      const dataUnsubscribe = subscribeRegistry(nodeDataListeners, nodeId, listener);
      const viewUnsubscribe = subscribeRegistry(nodeViewListeners, nodeId, listener);
      return () => {
        dataUnsubscribe();
        viewUnsubscribe();
      };
    },
    getFieldSnapshot,
    subscribeField: (query, listener) => {
      if (disposed) return () => undefined;
      connect();
      return subscribeRegistry(fieldListeners, getFieldQueryKey(query), listener);
    },
    getReferenceOptions: (query) => runtime.getReferenceOptions(query),
    subscribeReferenceOptions: (listener) => {
      if (disposed) return () => undefined;
      connect();
      referenceListeners.add(listener);
      return () => referenceListeners.delete(listener);
    },
    getCanvasHandle: () => canvasHandle,
    getStructureSnapshot,
    getGraphQueries: () => graphQueries,
    getWorkflowActions: () => actionsHandle,
    getPlacementContext: (request) => runtime.getPlacementContext(request),
    getDocumentVersion: () => (runtime.isDisposed() ? 0 : runtime.getSavepoint().contentRevision),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribeRuntime?.();
      unsubscribeIssues?.();
      unsubscribeIssues = undefined;
      workflowListeners.clear();
      nodeDataListeners.clear();
      nodeViewListeners.clear();
      fieldListeners.clear();
      referenceListeners.clear();
      nodeHandles.clear();
      fieldHandles.clear();
      setNameActions.clear();
      setFoldedActions.clear();
      updateNodeActions.clear();
    }
  };
};
