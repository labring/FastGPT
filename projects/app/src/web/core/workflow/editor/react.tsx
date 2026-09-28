import React, {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode
} from 'react';
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
  WorkflowSnapshot
} from '@fastgpt/global/core/workflow/editor';
// issue-only 通知类型与图查询类型直接从定义模块引入，不经过 editor barrel。
import type {
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

    const nextStructure = freezeStructure(runtime.getWorkflow());
    const structureChanged = !structureEqual(structure, nextStructure);
    if (structureChanged) {
      structure = nextStructure;
      workflowHandle = createWorkflowHandle(structure);
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
    if (structureChanged || change.kind === 'replace' || change.affectedRecords.structure) {
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
      nodeHandles.clear();
      fieldHandles.clear();
      setNameActions.clear();
      setFoldedActions.clear();
      updateNodeActions.clear();
    }
  };
};

const WorkflowEditorContext = createContext<WorkflowEditorAdapter | undefined>(undefined);

type WorkflowEditorProviderProps = {
  /** host 在 hydrate 出 Runtime 之前为 null；此时不挂 adapter，hooks 与未挂载时一样抛错。 */
  runtime: WorkflowRuntimePort | null;
  children: ReactNode;
};

/** 为已经 hydrate 成功的 host runtime 提供 scoped Workflow Hooks。 */
export const WorkflowEditorProvider = ({ runtime, children }: WorkflowEditorProviderProps) => {
  const adapter = useMemo(
    () => (runtime ? createWorkflowEditorAdapter(runtime, false) : undefined),
    [runtime]
  );

  useEffect(() => {
    if (!adapter) return;
    adapter.connect();
    return () => adapter.dispose();
  }, [adapter]);

  return (
    <WorkflowEditorContext.Provider value={adapter}>{children}</WorkflowEditorContext.Provider>
  );
};

const useWorkflowEditorAdapter = () => {
  const adapter = useContext(WorkflowEditorContext);
  if (!adapter) throw new Error('Workflow hooks must be used inside WorkflowEditorProvider');
  return adapter;
};

/** 读取稳定的节点 identity/parent identity 与 edge 结构。 */
export const useWorkflow = (): WorkflowStructureHandle => {
  const adapter = useWorkflowEditorAdapter();
  return useSyncExternalStore(
    adapter.subscribeWorkflow,
    adapter.getWorkflowSnapshot,
    adapter.getWorkflowSnapshot
  );
};

/** 读取单节点的 Node Data、Node View State，并提供稳定的 fold action。 */
export const useNode = (nodeId: string): WorkflowNodeHandle | undefined => {
  const adapter = useWorkflowEditorAdapter();
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeNode(nodeId, listener),
    [adapter, nodeId]
  );
  const getSnapshot = useMemo(() => () => adapter.getNodeSnapshot(nodeId), [adapter, nodeId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** 只读取节点写能力，不订阅节点数据；字段叶子用于结构编辑按钮。 */
export const useNodeActions = (nodeId: string): WorkflowNodeActions | undefined => {
  const adapter = useWorkflowEditorAdapter();
  return useMemo(() => adapter.getNodeActions(nodeId), [adapter, nodeId]);
};

/**
 * 把字段查询压成稳定对象：`subscribe` / `getSnapshot` 的 memo key 依赖它的身份，
 * 调用方每次渲染传字面量对象也不会重复订阅。`kind` 缺省时不写进对象，
 * 让「不指定 kind」与「kind: undefined」共用同一个 registry key。
 */
const useStableFieldQuery = ({ nodeId, fieldKey, kind }: WorkflowFieldQuery): WorkflowFieldQuery =>
  useMemo(
    () => ({ nodeId, fieldKey, ...(kind !== undefined ? { kind } : {}) }),
    [nodeId, fieldKey, kind]
  );

/** 读取单字段的 committed snapshot、引用状态，并提供稳定的字段提交 action。 */
export function useField(query: WorkflowFieldQuery): WorkflowFieldHandle | undefined;
export function useField(
  nodeId: string,
  fieldKey: string,
  kind?: WorkflowFieldQuery['kind']
): WorkflowFieldHandle | undefined;
export function useField(
  queryOrNodeId: WorkflowFieldQuery | string,
  fieldKey?: string,
  kind?: WorkflowFieldQuery['kind']
): WorkflowFieldHandle | undefined {
  const adapter = useWorkflowEditorAdapter();
  const queryNodeId = typeof queryOrNodeId === 'string' ? queryOrNodeId : queryOrNodeId.nodeId;
  const queryFieldKey = typeof queryOrNodeId === 'string' ? fieldKey : queryOrNodeId.fieldKey;
  const queryKind = typeof queryOrNodeId === 'string' ? kind : queryOrNodeId.kind;
  const query = useStableFieldQuery({
    nodeId: queryNodeId,
    fieldKey: queryFieldKey!,
    kind: queryKind
  });
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeField(query, listener),
    [adapter, query]
  );
  const getSnapshot = useMemo(() => () => adapter.getFieldSnapshot(query), [adapter, query]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 仅提供批量 geometry commit，不向 UI 暴露 runtime 或 generic dispatch。 */
export const useCanvas = (): WorkflowCanvasHandle => {
  const adapter = useWorkflowEditorAdapter();
  return adapter.getCanvasHandle();
};

/**
 * 稳定的 workflow 写能力句柄：结构句柄里的 command 部分，加上批量 geometry 提交与两个非订阅 getter。
 *
 * 订阅什么：什么都不订阅。返回的对象身份在 adapter 生命周期内恒定，结构变更、节点写入、
 * 字段提交与几何提交都不会让使用它的组件重渲染。
 * 什么时候重渲染：只有 Provider 换 runtime（adapter 重建）时。
 *
 * 与 handle hook 的分工：
 * - 渲染期要读 nodes/edges → `useWorkflow()`（整份结构句柄）或 `useWorkflowValue(selector)`（派生值）；
 * - 渲染期要读单节点/单字段 → `useNode` / `useField` / `useNodeValue` / `useFieldValue`；
 * - 只在事件回调里写文档 → 本句柄的 command；
 * - 只在事件回调里读当前值 → `getWorkflowSnapshot()` / `getEdges()`。这两个 getter 拿到的是
 *   点击瞬间的文档值，比渲染期快照更准（用户可能在渲染后又连了线再点删除）。
 *
 * 典型误用：在渲染期用 `getEdges()` / `getWorkflowSnapshot()` 的结果参与渲染计算。
 * 渲染期读取必须走订阅，否则文档变化后组件不会重渲染，画面与文档不一致。
 */
export const useWorkflowActions = (): WorkflowActionsHandle => {
  const adapter = useWorkflowEditorAdapter();
  return adapter.getWorkflowActions();
};

/**
 * 从结构快照派生一个值，只在派生结果变化时重渲染。
 *
 * 订阅什么：workflow 结构通道，与 `useWorkflow()` 是同一条订阅（结构变化、整文档 replace，
 * 以及 Runtime 标记 `affectedRecords.structure` 的变更）。节点内部字段写入、几何提交与
 * issue 刷新不通知这条通道。
 * 什么时候重渲染：通知到达后 selector 的返回值与上一次不满足 `Object.is` 时。
 * 原始值天然 bail out；store 内部持有的稳定引用（例如 `structure.edges`）也可以，
 * 因为它们的身份随结构版本变化。
 *
 * selector 约束：
 * 1. 每次通知都会跑，必须便宜。凡是「扫全量边/节点才能算出来」的判定走第二参的图查询，
 *    不要在 selector 里自己扫，否则只是把重渲染换成重计算。
 * 2. 只能返回原始值或稳定引用，**不能返回新建的对象/数组**。比较固定用 `Object.is`，
 *    没有深比较，也不提供 `isEqual` 入参（这是刻意的：深比较兜底会废掉「只取真正需要的信息」）。
 * 3. 第二参是 Runtime 图查询对象（`isMountedTool` / `isHandleConnected` / `getIncomingEdges` /
 *    `getChildNodeIds`），身份在 runtime 生命周期内不变，可以直接当 memo 依赖；
 *    它的集合返回值在同一结构版本内身份稳定，也可以直接当 selector 的返回值。
 *
 * 典型误用（`getSnapshot` 不能每次返回新对象，React 会无限重渲染并报
 * "The result of getSnapshot should be cached to avoid an infinite loop"）：
 *
 * ```ts
 * // ❌ 每次调用都新建数组，Object.is 永远判为变化
 * const ids = useWorkflowValue((structure) => structure.nodes.map((node) => node.nodeId));
 * // ❌ 每次调用都新建对象
 * const stat = useWorkflowValue((structure) => ({ count: structure.nodes.length }));
 *
 * // ✅ 返回原始值
 * const count = useWorkflowValue((structure) => structure.nodes.length);
 * const hasLoop = useWorkflowValue((structure) =>
 *   structure.nodes.some((node) => node.parentNodeId === loopId)
 * );
 * // ✅ 返回 store 内部持有的稳定引用
 * const edges = useWorkflowValue((structure) => structure.edges);
 * // ✅ 「扫全量边才能算出来」的判定走图查询，O(度) 而不是 O(E)
 * const connected = useWorkflowValue((_structure, graph) =>
 *   graph.isHandleConnected({ nodeId, handleId, direction: 'source' })
 * );
 * ```
 *
 * 需要列表内容而不是判定时，用 `useWorkflow()` 拿整份结构句柄，不要在 selector 里拷数组。
 */
export const useWorkflowValue = <T,>(
  selector: (structure: WorkflowStructureSnapshot, graph: WorkflowGraphQueries) => T
): T => {
  const adapter = useWorkflowEditorAdapter();
  const getSnapshot = () => selector(adapter.getStructureSnapshot(), adapter.getGraphQueries());
  return useSyncExternalStore(adapter.subscribeWorkflow, getSnapshot, getSnapshot);
};

/**
 * 从单节点的 scoped 快照派生一个值，只在该节点变化且派生结果变化时重渲染。
 *
 * 订阅什么：`nodeId` 这一个节点的数据通道与视图通道（语义写入、issue 刷新、几何提交、
 * 整文档 replace）。其它节点的任何变更都不通知。
 * 什么时候重渲染：该节点被通知后，selector 返回值与上一次不满足 `Object.is` 时。
 * 只关心语义数据的 selector（例如取 `data.name`）在纯几何提交时不会重渲染。
 *
 * selector 入参是 `WorkflowNodeHandle | undefined`：节点被删除或从未存在时为 `undefined`，
 * selector 必须容忍（用 `?.` 与默认值），不要用 `!` 断言，也不要指望运行时报错。
 * 返回值约束与 `useWorkflowValue` 相同：原始值或稳定引用，不能新建对象。
 *
 * 与 `useNode` 的分工：需要 `setName` / `setFolded` / `updateNode` 这些 action，
 * 或需要把整份 `data` / `view` 交给下游组件时用 `useNode`；只要一个派生的原始值时用本 hook。
 */
export const useNodeValue = <T,>(
  nodeId: string,
  selector: (node: WorkflowNodeHandle | undefined) => T
): T => {
  const adapter = useWorkflowEditorAdapter();
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeNode(nodeId, listener),
    [adapter, nodeId]
  );
  const getSnapshot = () => selector(adapter.getNodeSnapshot(nodeId));
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * 从单字段的 scoped 快照派生一个值，只在该字段变化且派生结果变化时重渲染。
 *
 * 订阅什么：`query` 命中的字段（不传 `kind` 时同名 input/output 都算）。
 * 什么时候重渲染：该字段被通知后，selector 返回值与上一次不满足 `Object.is` 时。
 * 同一节点其它字段的写入、结构变更与几何提交都不通知。
 *
 * selector 入参是 `WorkflowFieldHandle | undefined`：字段或所属节点被删除时为 `undefined`，
 * selector 必须容忍。返回值约束与 `useWorkflowValue` 相同：原始值或稳定引用，不能新建对象。
 * `query` 可以每次渲染传新对象，hook 内部按 nodeId/fieldKey/kind 归一成稳定引用，不会重复订阅。
 *
 * 与 `useField` 的分工：需要 `setValue` 提交，或需要把整份 `data` / `reference` 传给下游时用
 * `useField`；只要一个派生的原始值（例如「当前是否有值」）时用本 hook。
 */
export const useFieldValue = <T,>(
  query: WorkflowFieldQuery,
  selector: (field: WorkflowFieldHandle | undefined) => T
): T => {
  const adapter = useWorkflowEditorAdapter();
  const stableQuery = useStableFieldQuery(query);
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeField(stableQuery, listener),
    [adapter, stableQuery]
  );
  const getSnapshot = () => selector(adapter.getFieldSnapshot(stableQuery));
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * 读取当前文档下的 placement context：侧边栏、handle 快捷添加、模板落点与连线校验共用。
 * host 不再从画布数组重建 nodes/edges map，也不自己跑一遍容器校验。
 *
 * useWorkflow 只作为订阅触发器（结构或节点类型变化才重渲染），memo key 用文档内容版本。
 * 几何提交同样会 bump contentRevision，所以拖拽落点后会重算一次 context；issue 刷新不会。
 */
export const usePlacementContext = ({
  node,
  isSidebar
}: PlacementRequest): NodeTemplateContext | null => {
  const adapter = useWorkflowEditorAdapter();
  useWorkflow();
  const sourceNodeId = node?.nodeId;
  const sourceHandleId = node?.handleId ?? null;
  const documentVersion = adapter.getDocumentVersion();

  return useMemo(
    () =>
      adapter.getPlacementContext({
        node: sourceNodeId ? { nodeId: sourceNodeId, handleId: sourceHandleId } : undefined,
        isSidebar
      }),
    // documentVersion 是刻意的 memo key：context 由 runtime 内部索引派生，闭包里不读它。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter, documentVersion, sourceNodeId, sourceHandleId, isSidebar]
  );
};
