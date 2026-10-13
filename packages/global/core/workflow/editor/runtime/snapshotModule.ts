import type { AppChatConfigType } from '../../../app/type';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../../type/io';
import type { WorkflowCheckIssue } from '../../type/node';
import type {
  WorkflowActionsHandle,
  WorkflowCanvasEdgeSnapshot,
  WorkflowDispatchResult,
  WorkflowConfigIssue,
  WorkflowEdgeSnapshot,
  WorkflowFieldIdentity,
  WorkflowFieldHandle,
  WorkflowFieldQuery,
  WorkflowFieldSnapshot,
  WorkflowGeometryUpdate,
  WorkflowIssuesSnapshot,
  WorkflowNodeActions,
  WorkflowNodeHandle,
  WorkflowNodeSnapshot,
  WorkflowNodeUpdateOptions,
  WorkflowReferenceOptionsQuery,
  WorkflowReferenceOption,
  WorkflowReferenceStatus,
  WorkflowSnapshot,
  WorkflowStructureSnapshot,
  WorkflowCommand,
  WorkflowNodeData,
  DeepReadonly,
  WorkflowNodeViewSnapshot
} from '../types';
import { cloneValue, freezeValue, getFieldIdentityKey } from './kernel';
import type {
  DocumentReadApi,
  EdgeRecord,
  NodeRecord,
  SnapshotFieldCacheEntry,
  SnapshotModuleState
} from './types';

type SnapshotReferenceApi = {
  getFieldStatuses: (
    nodeId: string,
    field: FlowNodeInputItemType | FlowNodeOutputItemType
  ) => WorkflowReferenceStatus[];
  getReferenceOptions: (query: WorkflowReferenceOptionsQuery) => WorkflowReferenceOption[];
  invalidateFieldStatuses: (fields: Iterable<WorkflowFieldIdentity>) => void;
};

type SnapshotIssueApi = {
  getNodeIssues: (nodeId: string) => WorkflowCheckIssue[];
  getIssuesByNode: () => Map<string, WorkflowCheckIssue[]>;
  getConfigIssues: () => WorkflowConfigIssue[];
};

type SnapshotModuleOptions = {
  document: Pick<DocumentReadApi, 'getDocument' | 'getNodeById'>;
  reference: SnapshotReferenceApi;
  issue: SnapshotIssueApi;
  ensureActive: () => void;
  getSemanticVersion: () => number;
  getNodeView: (nodeId: string) => WorkflowNodeViewSnapshot | undefined;
  dispatch: (command: WorkflowCommand | readonly WorkflowCommand[]) => WorkflowDispatchResult;
};

/** Runtime 快照唯一持有者；复用现有缓存身份与失效规则，不暴露内部记录。 */
export const createSnapshotModule = ({
  document,
  reference,
  issue,
  ensureActive,
  getSemanticVersion,
  getNodeView,
  dispatch
}: SnapshotModuleOptions) => {
  const nodeSnapshotCache = new Map<
    string,
    { record: NodeRecord; issues: WorkflowCheckIssue[]; snapshot: WorkflowNodeSnapshot }
  >();
  const referenceOptionsCache = new Map<string, readonly WorkflowReferenceOption[]>();
  const edgeSnapshotCache = new Map<EdgeRecord, WorkflowEdgeSnapshot>();
  const canvasEdgeSnapshotCache = new Map<EdgeRecord, WorkflowCanvasEdgeSnapshot>();
  let canvasEdgesSnapshotCache:
    | { version: number; edges: readonly WorkflowCanvasEdgeSnapshot[] }
    | undefined;
  const fieldSnapshotCache = new Map<string, SnapshotFieldCacheEntry>();
  const fieldHandles = new Map<string, WorkflowFieldHandle>();
  const fieldValueActions = new Map<string, WorkflowFieldHandle['setValue']>();
  const nodeHandles = new Map<string, WorkflowNodeHandle>();
  const setNameActions = new Map<string, WorkflowNodeHandle['setName']>();
  const setFoldedActions = new Map<string, WorkflowNodeHandle['setFolded']>();
  const updateNodeActions = new Map<string, WorkflowNodeHandle['updateNode']>();
  let structureSnapshotCache: { version: number; snapshot: WorkflowStructureSnapshot } | undefined;
  let workflowSnapshotCache: { version: number; snapshot: WorkflowSnapshot } | undefined;
  let workflowIssuesCache:
    | {
        issuesByNode: Map<string, WorkflowCheckIssue[]>;
        configIssues: WorkflowConfigIssue[];
        snapshot: WorkflowIssuesSnapshot;
      }
    | undefined;
  let chatConfigSnapshotCache:
    | { record: AppChatConfigType; snapshot: AppChatConfigType }
    | undefined;

  const getEdgeSnapshot = (edge: EdgeRecord): WorkflowEdgeSnapshot => {
    const cached = edgeSnapshotCache.get(edge);
    if (cached) return cached;
    const snapshot = freezeValue(cloneValue(edge.data)) as WorkflowEdgeSnapshot;
    edgeSnapshotCache.set(edge, snapshot);
    return snapshot;
  };

  const getCanvasEdgeSnapshot = (edge: EdgeRecord): WorkflowCanvasEdgeSnapshot => {
    const cached = canvasEdgeSnapshotCache.get(edge);
    if (cached) return cached;
    const snapshot = freezeValue({
      id: edge.id,
      ...cloneValue(edge.data)
    }) as WorkflowCanvasEdgeSnapshot;
    canvasEdgeSnapshotCache.set(edge, snapshot);
    return snapshot;
  };

  /** 返回 Node Data scoped snapshot，并仅缓存当前 Node Data 与 Issue 数组。 */
  const getNodeSnapshot = (nodeId: string): WorkflowNodeSnapshot | undefined => {
    ensureActive();
    const node = document.getNodeById(nodeId);
    if (!node) return undefined;
    const issues = issue.getNodeIssues(nodeId);
    const cached = nodeSnapshotCache.get(nodeId);
    if (cached?.record.data === node.data && cached.issues === issues) return cached.snapshot;
    const snapshot = freezeValue({
      ...cloneValue(node.data),
      issues: cloneValue(issues)
    }) as WorkflowNodeSnapshot;
    nodeSnapshotCache.set(nodeId, { record: node, issues, snapshot });
    return snapshot;
  };

  /** 结构快照只保留节点身份和边；语义节点数据继续由 workflow/node scoped getter 提供。 */
  const getStructureSnapshot = (): WorkflowStructureSnapshot => {
    ensureActive();
    const version = getSemanticVersion();
    if (structureSnapshotCache?.version === version) return structureSnapshotCache.snapshot;
    const current = document.getDocument();
    const snapshot = freezeValue({
      nodes: current.nodes.map(({ data }) => ({
        nodeId: data.nodeId,
        ...(data.parentNodeId !== undefined ? { parentNodeId: data.parentNodeId } : {})
      })),
      edges: current.edges.map(getEdgeSnapshot)
    }) as WorkflowStructureSnapshot;
    structureSnapshotCache = { version, snapshot };
    return snapshot;
  };

  const getSetName = (nodeId: string) => {
    const previous = setNameActions.get(nodeId);
    if (previous) return previous;
    const action = (name: string) => dispatch({ type: 'updateNode', nodeId, patch: { name } });
    setNameActions.set(nodeId, action);
    return action;
  };

  const getSetFolded = (nodeId: string) => {
    const previous = setFoldedActions.get(nodeId);
    if (previous) return previous;
    const action = (isFolded: boolean) => dispatch({ type: 'commitGeometry', nodeId, isFolded });
    setFoldedActions.set(nodeId, action);
    return action;
  };

  const getUpdateNode = (nodeId: string) => {
    const previous = updateNodeActions.get(nodeId);
    if (previous) return previous;
    const action = (
      patch: (node: WorkflowNodeSnapshot) => Partial<DeepReadonly<WorkflowNodeData>>,
      options?: WorkflowNodeUpdateOptions
    ) => {
      const current = getNodeSnapshot(nodeId);
      const resolved = current ? patch(current) : {};
      return dispatch([
        ...(options?.disconnectEdges?.map((command) => ({
          type: 'disconnectEdge' as const,
          ...command
        })) ?? []),
        { type: 'updateNode', nodeId, patch: resolved as Partial<WorkflowNodeData> }
      ]);
    };
    updateNodeActions.set(nodeId, action);
    return action;
  };

  const dropNodeHandle = (nodeId: string) => {
    nodeHandles.delete(nodeId);
    setNameActions.delete(nodeId);
    setFoldedActions.delete(nodeId);
    updateNodeActions.delete(nodeId);
  };

  const getNodeHandle = (nodeId: string): WorkflowNodeHandle | undefined => {
    const data = getNodeSnapshot(nodeId);
    const view = getNodeView(nodeId);
    if (!data || !view) {
      dropNodeHandle(nodeId);
      return undefined;
    }
    const previous = nodeHandles.get(nodeId);
    if (previous?.data === data && previous.view === view) return previous;
    const handle = Object.freeze({
      data,
      view,
      setName: getSetName(nodeId),
      setFolded: getSetFolded(nodeId),
      updateNode: getUpdateNode(nodeId)
    }) as WorkflowNodeHandle;
    nodeHandles.set(nodeId, handle);
    return handle;
  };

  const getNodeActions = (nodeId: string): WorkflowNodeActions | undefined => {
    const handle = getNodeHandle(nodeId);
    if (!handle) return undefined;
    return {
      setName: handle.setName,
      setFolded: handle.setFolded,
      updateNode: handle.updateNode
    };
  };

  /** 返回画布连线 snapshot；语义版本不变时复用整个数组身份。 */
  const getCanvasEdges = (): readonly WorkflowCanvasEdgeSnapshot[] => {
    ensureActive();
    const semanticVersion = getSemanticVersion();
    if (canvasEdgesSnapshotCache?.version === semanticVersion) {
      return canvasEdgesSnapshotCache.edges;
    }
    const edges = freezeValue(
      document.getDocument().edges.map(getCanvasEdgeSnapshot)
    ) as readonly WorkflowCanvasEdgeSnapshot[];
    canvasEdgesSnapshotCache = { version: semanticVersion, edges };
    return edges;
  };

  const getChatConfigSnapshot = (chatConfig: AppChatConfigType): AppChatConfigType => {
    if (chatConfigSnapshotCache?.record === chatConfig) return chatConfigSnapshotCache.snapshot;
    const snapshot = freezeValue(cloneValue(chatConfig)) as AppChatConfigType;
    chatConfigSnapshotCache = { record: chatConfig, snapshot };
    return snapshot;
  };

  /** Gate 专用问题视图按 Issue Map 身份缓存，避免普通字段读取携带全量问题深拷贝。 */
  const getWorkflowIssues = (): WorkflowIssuesSnapshot => {
    ensureActive();
    const issuesByNode = issue.getIssuesByNode();
    const configIssues = issue.getConfigIssues();
    if (
      workflowIssuesCache?.issuesByNode === issuesByNode &&
      workflowIssuesCache.configIssues === configIssues
    ) {
      return workflowIssuesCache.snapshot;
    }
    const snapshot = freezeValue({
      issues: Array.from(issuesByNode.values()).flatMap((issues) => cloneValue(issues)),
      chatConfigIssues: cloneValue(configIssues)
    }) as WorkflowIssuesSnapshot;
    workflowIssuesCache = { issuesByNode, configIssues, snapshot };
    return snapshot;
  };

  /** 返回 workflow scoped snapshot；版本不变时保持对象身份稳定。 */
  const getWorkflowSnapshot = (): WorkflowSnapshot => {
    ensureActive();
    const semanticVersion = getSemanticVersion();
    if (workflowSnapshotCache?.version === semanticVersion) return workflowSnapshotCache.snapshot;
    const current = document.getDocument();
    const snapshot = freezeValue({
      nodes: current.nodes.map((node) => getNodeSnapshot(node.data.nodeId)!),
      edges: current.edges.map(getEdgeSnapshot),
      chatConfig: getChatConfigSnapshot(current.chatConfig)
    }) as WorkflowSnapshot;
    workflowSnapshotCache = { version: semanticVersion, snapshot };
    return snapshot;
  };

  /** 返回单字段 snapshot，并按字段引用与引用状态缓存身份。 */
  const getFieldSnapshot = ({
    nodeId,
    fieldKey,
    kind
  }: WorkflowFieldQuery): WorkflowFieldSnapshot | undefined => {
    ensureActive();
    const node = document.getNodeById(nodeId);
    if (!node) return undefined;
    const input =
      kind !== 'output' ? node.data.inputs.find((item) => item.key === fieldKey) : undefined;
    const output =
      kind !== 'input' ? node.data.outputs.find((item) => item.id === fieldKey) : undefined;
    const field = input ?? output;
    if (!field) return undefined;
    const fieldKind = input ? 'input' : 'output';
    const cacheKey = getFieldIdentityKey({ nodeId, kind: fieldKind, key: fieldKey });
    const cached = fieldSnapshotCache.get(cacheKey);
    if (cached?.field === field) return cached.snapshot;

    const statuses = input ? reference.getFieldStatuses(nodeId, input) : [];
    const referenceOptions = input
      ? reference.getReferenceOptions({ nodeId, valueType: input.valueType })
      : [];
    const snapshot = freezeValue({
      nodeId,
      key: fieldKey,
      kind: fieldKind,
      ...(input ? { input: cloneValue(input) } : { output: cloneValue(output) }),
      references: cloneValue(statuses),
      referenceOptions: cloneValue(referenceOptions)
    }) as WorkflowFieldSnapshot;
    fieldSnapshotCache.set(cacheKey, {
      nodeId,
      fieldKey,
      kind: fieldKind,
      field,
      snapshot
    });
    return snapshot;
  };

  const getSetFieldValue = (identity: WorkflowFieldIdentity) => {
    const identityKey = getFieldIdentityKey(identity);
    const previous = fieldValueActions.get(identityKey);
    if (previous) return previous;
    const action = (value: unknown) =>
      dispatch({
        type: 'updateField',
        nodeId: identity.nodeId,
        fieldKey: identity.key,
        kind: identity.kind,
        value
      });
    fieldValueActions.set(identityKey, action);
    return action;
  };

  const getFieldHandle = (query: WorkflowFieldQuery): WorkflowFieldHandle | undefined => {
    const data = getFieldSnapshot(query);
    if (!data) {
      const kinds = query.kind ? [query.kind] : (['input', 'output'] as const);
      kinds.forEach((kind) =>
        fieldHandles.delete(
          getFieldIdentityKey({ nodeId: query.nodeId, key: query.fieldKey, kind })
        )
      );
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

  /** 返回稳定的引用选择项；通用嵌套值与字段 snapshot 共用 Runtime Reference 语义。 */
  const getReferenceOptions = (
    query: WorkflowReferenceOptionsQuery
  ): readonly WorkflowReferenceOption[] => {
    ensureActive();
    const { nodeId, valueType, includeChildren } = query;
    const cacheKey = `${nodeId}\0${valueType ?? '*'}\0${includeChildren ? 'children' : 'direct'}`;
    const cached = referenceOptionsCache.get(cacheKey);
    if (cached) return cached;
    const options = freezeValue(
      cloneValue(reference.getReferenceOptions(query))
    ) as readonly WorkflowReferenceOption[];
    referenceOptionsCache.set(cacheKey, options);
    return options;
  };

  const commitGeometry = (updates: readonly WorkflowGeometryUpdate[]): WorkflowDispatchResult =>
    dispatch(
      updates.map(({ nodeId, position, isFolded }) => ({
        type: 'commitGeometry' as const,
        nodeId,
        ...(position ? { position: { x: position.x, y: position.y } } : {}),
        ...(isFolded !== undefined ? { isFolded } : {})
      }))
    );

  const workflowActions: WorkflowActionsHandle = Object.freeze({
    addNode: (node) => dispatch({ type: 'addNode', node }),
    addNodes: (nodes, edge) =>
      dispatch([
        ...nodes.map((node) => ({ type: 'addNode' as const, node })),
        ...(edge ? [{ type: 'connectEdge' as const, edge }] : [])
      ]),
    connectEdge: (edge) => dispatch({ type: 'connectEdge', edge }),
    disconnectEdge: (command) => dispatch({ type: 'disconnectEdge', ...command }),
    disconnectEdges: (commands) =>
      dispatch(commands.map((command) => ({ type: 'disconnectEdge' as const, ...command }))),
    removeNodes: (nodeIds) => dispatch({ type: 'removeNodes', nodeIds: [...nodeIds] }),
    attachToContainer: (nodeId, containerId) =>
      dispatch({ type: 'attachToContainer', nodeId, containerId }),
    commitGeometry,
    getWorkflowSnapshot: getStructureSnapshot,
    getEdges: () => getStructureSnapshot().edges
  });

  const getState = (): SnapshotModuleState => ({
    fieldSnapshotCache: new Map(fieldSnapshotCache)
  });

  const restoreState = (state: SnapshotModuleState) => {
    fieldSnapshotCache.clear();
    state.fieldSnapshotCache.forEach((value, key) => fieldSnapshotCache.set(key, value));
  };

  const invalidateFieldCaches = (fields: Iterable<WorkflowFieldIdentity>) => {
    const list = [...fields];
    reference.invalidateFieldStatuses(list);
    list.forEach((field) => {
      const key = getFieldIdentityKey(field);
      fieldSnapshotCache.delete(key);
      fieldHandles.delete(key);
    });
  };

  /** 只裁剪不再对应当前记录的缓存，保留仍共享底层记录的 snapshot identity。 */
  const prune = () => {
    nodeSnapshotCache.forEach((cached, nodeId) => {
      const current = document.getNodeById(nodeId);
      if (!current || cached.record.data !== current.data) nodeSnapshotCache.delete(nodeId);
    });
    nodeHandles.forEach((_handle, nodeId) => {
      if (!document.getNodeById(nodeId)) dropNodeHandle(nodeId);
    });
    const currentEdges = new Set(document.getDocument().edges);
    edgeSnapshotCache.forEach((_snapshot, record) => {
      if (!currentEdges.has(record)) edgeSnapshotCache.delete(record);
    });
    if (chatConfigSnapshotCache?.record !== document.getDocument().chatConfig) {
      chatConfigSnapshotCache = undefined;
    }
  };

  const clear = () => {
    nodeSnapshotCache.clear();
    referenceOptionsCache.clear();
    edgeSnapshotCache.clear();
    canvasEdgeSnapshotCache.clear();
    canvasEdgesSnapshotCache = undefined;
    fieldSnapshotCache.clear();
    fieldHandles.clear();
    fieldValueActions.clear();
    nodeHandles.clear();
    setNameActions.clear();
    setFoldedActions.clear();
    updateNodeActions.clear();
    structureSnapshotCache = undefined;
    workflowSnapshotCache = undefined;
    workflowIssuesCache = undefined;
    chatConfigSnapshotCache = undefined;
  };

  return {
    getNodeSnapshot,
    getStructureSnapshot,
    getCanvasEdges,
    getWorkflowIssues,
    getWorkflowSnapshot,
    getFieldSnapshot,
    getFieldHandle,
    getReferenceOptions,
    getNodeHandle,
    getNodeActions,
    getWorkflowActions: () => workflowActions,
    getState,
    restoreState,
    invalidateFieldCaches,
    clearFieldSnapshots: () => fieldSnapshotCache.clear(),
    clearReferenceOptions: () => referenceOptionsCache.clear(),
    clearWorkflowIssues: () => {
      workflowIssuesCache = undefined;
    },
    invalidateWorkflowSnapshot: () => {
      workflowSnapshotCache = undefined;
    },
    prune,
    clear
  };
};
