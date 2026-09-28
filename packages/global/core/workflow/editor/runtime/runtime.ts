import type { CanonicalWorkflowData } from '../../migration/schema';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../../type/io';
import type { WorkflowCheckIssue } from '../../type/node';
import type {
  WorkflowChange,
  WorkflowAffectedRecords,
  WorkflowChangedRecords,
  WorkflowCommand,
  WorkflowCommandError,
  WorkflowDispatchResult,
  WorkflowEdgeSnapshot,
  WorkflowFieldIdentity,
  WorkflowFieldQuery,
  WorkflowFieldSnapshot,
  WorkflowConfigIssue,
  WorkflowIssueScope,
  WorkflowIssueUpdate,
  WorkflowIssuesSnapshot,
  WorkflowNodeSnapshot,
  WorkflowRuntimePort,
  WorkflowRuntimeOptions,
  WorkflowSavepoint,
  WorkflowSnapshot
} from '../types';
import type { AppChatConfigType } from '../../../app/type';
import {
  addFieldIdentity,
  cloneValue,
  freezeValue,
  getError,
  getFieldIdentityKey,
  isObject
} from './kernel';
import { createDocumentModule } from './documentModule';
import { buildDocument, documentToCanonical, resolveStructureChanged } from './documentRules';
import { createNodeViewModule } from './nodeViewModule';
import { createReferenceModule } from './referenceModule';
import { createIssueModule } from './issueModule';
import {
  createHistoryModule,
  createGeometryHistoryEntry,
  createHistoryEntry,
  collectViewChanges
} from './historyModule';
import type {
  GeometryCommand,
  MutationMeta,
  NodeRecord,
  EdgeRecord,
  RuntimeDocument,
  TransactionContext
} from './types';

/**
 * Runtime Core：只负责事务编排、revision/transaction 身份、原子提交、单次派生、
 * WorkflowChange 组装、订阅发布、释放，以及手写 public Port 装配。
 * 领域规则全部在 Document / NodeView / Reference / Issue / History module 内。
 */

const MAX_CHANGE_LOG = 100;

/** 没有 issue 变化时复用的空通知载荷。 */
const EMPTY_ISSUE_UPDATE = freezeValue({ nodeIds: [] }) as WorkflowIssueUpdate;

const createMutationMeta = (kind: MutationMeta['kind'] = 'semantic'): MutationMeta => ({
  kind,
  changedNodeIds: new Set(),
  changedFieldIds: new Map(),
  changedEdgeIds: new Set(),
  affectedNodeIds: new Set(),
  affectedFieldIds: new Map(),
  structureChanged: false,
  chatConfigChanged: false,
  chatConfigVariablesChanged: false,
  nodeChanges: new Map(),
  nodeViewChanges: new Map(),
  addedEdges: new Map(),
  removedEdges: new Map()
});

const isWorkflowCommandErrorCode = (value: unknown): value is WorkflowCommandError['code'] =>
  value === 'disposed' ||
  value === 'invalid_command' ||
  value === 'not_found' ||
  value === 'duplicate_node' ||
  value === 'invalid_edge' ||
  value === 'invalid_placement';

const isWorkflowCommandError = (value: unknown): value is WorkflowCommandError =>
  isObject(value) && isWorkflowCommandErrorCode(value.code) && typeof value.message === 'string';

const workflowCommandTypes = new Set<string>([
  'addNode',
  'replaceNode',
  'updateNode',
  'updateField',
  'removeNodes',
  'connectEdge',
  'disconnectEdge',
  'attachToContainer',
  'updateChatConfig',
  'commitGeometry',
  'replaceDocument'
]);

/** 运行时守卫闭合 command 边界，避免 JS 调用方让未知命令静默成功。 */
const isWorkflowCommand = (value: unknown): value is WorkflowCommand =>
  isObject(value) && typeof value.type === 'string' && workflowCommandTypes.has(value.type);

/** 从 strict canonical fixture 创建 Workflow Runtime Port；editor 特性通过 options 注入。 */
export const createWorkflowEditor = (
  strictCanonicalData: CanonicalWorkflowData,
  options: WorkflowRuntimeOptions = {}
): WorkflowRuntimePort => {
  // 入站边界只组装一次：语义记录归 Document，位置与折叠归 Node View。
  const initial = buildDocument(strictCanonicalData);
  // 固定依赖顺序：Document -> NodeView -> Reference -> Issue -> History。
  const document = createDocumentModule(initial);
  const nodeView = createNodeViewModule({ document, views: initial.views });
  const reference = createReferenceModule(document);
  const issue = createIssueModule({
    document,
    reference,
    getEnvironment: options.getEnvironment
  });
  const history = createHistoryModule();

  let disposed = false;
  /** 通知版本：单调递增，供快照缓存与订阅使用，不参与保存状态判定。 */
  let workflowVersion = 0;
  let semanticVersion = 0;
  let transactionId = 0;
  /** 当前已提交内容的 Content Revision；undo/redo 会恢复成 history 记录里的值。 */
  let contentRevision = 0;
  /** Content Revision 分配器；只增不减，保证一个内容状态只对应一个版本号（ADR 0002）。 */
  let contentRevisionCounter = 0;
  /** 已确认保存的内容版本；与当前内容版本不同即为脏。 */
  let savedRevision = 0;
  const listeners = new Set<(change: WorkflowChange) => void>();
  /** issue-only 订阅：刷新不是 Workflow Change，因此走独立通道。 */
  const issueListeners = new Set<(update: WorkflowIssueUpdate) => void>();
  const changeLog: WorkflowChange[] = [];
  const nodeSnapshotCache = new Map<
    string,
    { record: NodeRecord; issues: WorkflowCheckIssue[]; snapshot: WorkflowNodeSnapshot }
  >();
  const edgeSnapshotCache = new Map<EdgeRecord, WorkflowEdgeSnapshot>();
  const fieldSnapshotCache = new Map<
    string,
    {
      nodeId: string;
      fieldKey: string;
      kind: 'input' | 'output';
      field: FlowNodeInputItemType | FlowNodeOutputItemType;
      snapshot: WorkflowFieldSnapshot;
    }
  >();
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

  const ensureActive = () => {
    if (disposed) throw new Error('Workflow editor has been disposed');
  };

  /** 将内部 mutation meta 转为冻结的精确变更事件。 */
  const makeChange = (meta: MutationMeta, origin: 'command' | 'undo' | 'redo'): WorkflowChange => {
    const base = {
      origin,
      version: workflowVersion,
      transactionId: ++transactionId
    };
    const changedRecords: WorkflowChangedRecords = {
      nodeIds: [...meta.changedNodeIds],
      nodeViewIds: [...meta.nodeViewChanges.keys()],
      fieldIds: [...meta.changedFieldIds.values()],
      edgeIds: [...meta.changedEdgeIds],
      chatConfig: meta.chatConfigChanged,
      chatConfigVariablesChanged: meta.chatConfigVariablesChanged
    };
    const affectedRecords: WorkflowAffectedRecords = {
      nodeIds: [...meta.affectedNodeIds],
      fieldIds: [...meta.affectedFieldIds.values()],
      structure: meta.structureChanged
    };
    return freezeValue({
      ...base,
      kind: meta.kind,
      changedRecords,
      affectedRecords
    }) as WorkflowChange;
  };

  /** 先记录再通知；单个 listener 异常不能破坏其他订阅者的一致观察。 */
  const publish = (change: WorkflowChange) => {
    changeLog.push(change);
    if (changeLog.length > MAX_CHANGE_LOG) changeLog.splice(0, changeLog.length - MAX_CHANGE_LOG);
    listeners.forEach((listener) => {
      try {
        listener(change);
      } catch {
        // 一个订阅者失败不能阻止其他订阅者观察完整事务。
      }
    });
  };

  const invalidateFieldCaches = (fields: Iterable<WorkflowFieldIdentity>) => {
    const list = [...fields];
    reference.invalidateFieldStatuses(list);
    list.forEach((field) => fieldSnapshotCache.delete(getFieldIdentityKey(field)));
  };

  const pruneSnapshotCaches = () => {
    nodeSnapshotCache.forEach((cached, nodeId) => {
      const current = document.getNodeById(nodeId);
      if (!current || cached.record.data !== current.data) nodeSnapshotCache.delete(nodeId);
    });
    const currentEdges = new Set(document.getDocument().edges);
    edgeSnapshotCache.forEach((_snapshot, record) => {
      if (!currentEdges.has(record)) edgeSnapshotCache.delete(record);
    });
    if (chatConfigSnapshotCache?.record !== document.getDocument().chatConfig) {
      chatConfigSnapshotCache = undefined;
    }
    nodeView.pruneSnapshotCache();
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

  const getEdgeSnapshot = (edge: EdgeRecord): WorkflowEdgeSnapshot => {
    const cached = edgeSnapshotCache.get(edge);
    if (cached) return cached;
    const snapshot = freezeValue(cloneValue(edge.data)) as WorkflowEdgeSnapshot;
    edgeSnapshotCache.set(edge, snapshot);
    return snapshot;
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
    const referenceOptions = input ? reference.getReferenceOptions(nodeId, input) : [];
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

  /** 扁平命令路由：geometry 交给 NodeView，其余交给 Document。 */
  const applyCommand = (ctx: TransactionContext, command: WorkflowCommand) => {
    if (command.type === 'commitGeometry') nodeView.reduceGeometryCommand(ctx, command);
    else document.reduceCommand(ctx, command);
  };

  /** 纯 geometry 事务只改 Node View、history 和事件，完全不触碰 Document 与语义派生状态。 */
  const dispatchGeometry = (commands: readonly GeometryCommand[]): WorkflowDispatchResult => {
    const meta = createMutationMeta('geometry');
    const staged = nodeView.stageGeometryBatch(commands, meta);
    if (!staged.ok) return { ok: false, error: staged.error };
    if (!staged.views) return { ok: true };

    const beforeContentRevision = contentRevision;
    nodeView.commitViews(staged.views);
    workflowVersion++;
    contentRevision = ++contentRevisionCounter;

    const change = makeChange(meta, 'command');
    history.push(
      createGeometryHistoryEntry({
        viewChanges: collectViewChanges(meta),
        beforeContentRevision,
        afterContentRevision: contentRevision,
        change
      })
    );
    publish(change);
    return { ok: true, change };
  };

  /** 执行单命令或原子命令数组；失败时 working 副本直接丢弃。 */
  const dispatch = (
    commands: WorkflowCommand | readonly WorkflowCommand[]
  ): WorkflowDispatchResult => {
    if (disposed)
      return { ok: false, error: getError('disposed', 'Workflow editor has been disposed') };
    const list = Array.isArray(commands) ? [...commands] : [commands];
    if (list.length === 0) return { ok: true };
    if (list.some((command) => !isWorkflowCommand(command))) {
      return { ok: false, error: getError('invalid_command', 'Unknown workflow command') };
    }
    if (list.some((command) => command.type === 'replaceDocument') && list.length !== 1) {
      return {
        ok: false,
        error: getError(
          'invalid_command',
          'replaceDocument must be the only command in a transaction'
        )
      };
    }
    if (list.every((command) => command.type === 'commitGeometry')) {
      return dispatchGeometry(list as readonly GeometryCommand[]);
    }
    const before = document.getDocument();
    const beforeNextEdgeId = document.getNextEdgeId();
    const beforeReferenceGraph = reference.getGraph();
    const workingReferenceGraph = reference.forkGraph();
    const working: RuntimeDocument = {
      nodes: before.nodes.slice(),
      edges: before.edges.slice(),
      chatConfig: before.chatConfig,
      // 快照默认原样继承；本轮真有来源消失时由 reference.captureSnapshots 整体替换。
      referenceSnapshots: before.referenceSnapshots
    };
    const views = new Map(nodeView.getViews());
    const meta = createMutationMeta();
    const ctx: TransactionContext = { working, views, meta, referenceGraph: workingReferenceGraph };
    try {
      list.forEach((command) => applyCommand(ctx, command));
      if (list.some((command) => command.type === 'connectEdge')) {
        document.applyWorkflowStartAutoFill(ctx);
      }
    } catch (error) {
      document.setNextEdgeId(beforeNextEdgeId);
      const commandError = isWorkflowCommandError(error)
        ? error
        : getError('invalid_command', error instanceof Error ? error.message : String(error));
      return { ok: false, error: commandError };
    }
    const hasChanges =
      meta.kind === 'replace' ||
      meta.changedNodeIds.size > 0 ||
      meta.nodeViewChanges.size > 0 ||
      meta.changedEdgeIds.size > 0 ||
      meta.chatConfigChanged;
    if (!hasChanges) {
      document.setNextEdgeId(beforeNextEdgeId);
      return { ok: true };
    }

    // 整文档替换是全量失效分支，结构信号必须发布，不能被增量判定覆盖。
    meta.structureChanged = meta.kind === 'replace' || resolveStructureChanged(meta);
    document.applyDerivedFields(ctx);
    const beforeContentRevision = contentRevision;
    document.setDocument(working);
    nodeView.commitViews(views);
    workflowVersion++;
    contentRevision = ++contentRevisionCounter;
    if (meta.kind !== 'geometry') semanticVersion++;
    if (meta.kind === 'replace') {
      document.rebuildNodeIndex();
      document.rebuildGraphIndex();
      document.rebuildWorkflowStartIds();
      reference.rebuildGraph();
      // 整文档替换是全量失效分支：Issue View 按替换后的文档与环境事实整体重算。
      issue.rebuildIssues();
      reference.pruneFieldStatusCache();
      fieldSnapshotCache.clear();
      workflowIssuesCache = undefined;
    } else {
      document.updateNodeIndexIncrementally(meta);
      document.updateGraphIndexIncrementally(meta);
      document.updateWorkflowStartIndex(meta);
      // 单次派生按 Document -> Reference -> Issue 顺序执行；issue 候选集合必须在引用派生
      // 之前收集，才能保证 affected records 的排列与派生顺序一致。
      const issueNodeIds = issue.collectTransactionNodeIds(meta);
      const cacheOnlyFieldIds = reference.commitTransaction({
        meta,
        stagedGraph: workingReferenceGraph,
        beforeGraph: beforeReferenceGraph
      });
      // working 已经通过 setDocument 成为当前文档，这里补齐它的快照字段。
      // 必须早于下面的 Issue 重算，历史展示字段才能进 Issue View 与字段状态。
      working.referenceSnapshots = reference.captureSnapshots({
        previous: before,
        beforeGraph: beforeReferenceGraph,
        afterGraph: workingReferenceGraph,
        meta
      });
      document.addAffectedStructure(meta);
      invalidateFieldCaches([
        ...meta.changedFieldIds.values(),
        ...cacheOnlyFieldIds.values(),
        ...reference.getStructureInvalidationFields(meta)
      ]);
      issue.rebuildForTransaction({ meta, candidateNodeIds: issueNodeIds });
    }
    const change = makeChange(meta, 'command');
    history.push(
      createHistoryEntry({
        before,
        after: document.getDocument(),
        viewChanges: collectViewChanges(meta),
        beforeContentRevision,
        afterContentRevision: contentRevision,
        change
      })
    );
    pruneSnapshotCaches();
    publish(change);
    return { ok: true, change };
  };

  /**
   * 以 undo/redo 来源重放 history，不新增 history entry。
   *
   * count > 1 服务于版本列表跳转：连续回放多条记录，中间态一律不发布，订阅者只看到一条合并事件，
   * 因此回放过程不会被画布当成新编辑写回（写回会推入新记录并清空 redo 分支）。
   * 可用记录不足 count 时按实际条数回放并成功返回，目标版本是否命中由调用方按 Content Revision 校验。
   */
  const replayHistory = (direction: 'undo' | 'redo', count = 1): WorkflowDispatchResult => {
    if (disposed)
      return { ok: false, error: getError('disposed', 'Workflow editor has been disposed') };
    const steps = Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1;
    // Issue 差异按整批计算：批量回放对订阅者是一次变化，中间态的 issue 抖动没有意义。
    const previousIssues = issue.getIssuesByNode();
    const meta = createMutationMeta('geometry');
    let applied = 0;

    /** 把一条 history 记录携带的变更集合并入整批 meta；replay 只借 meta 组装事件，视图值已由记录恢复。 */
    const mergeReplayedChange = (originalChange: WorkflowChange) => {
      originalChange.changedRecords.nodeIds.forEach((nodeId) => meta.changedNodeIds.add(nodeId));
      originalChange.changedRecords.nodeViewIds.forEach((nodeId) =>
        meta.nodeViewChanges.set(nodeId, {})
      );
      originalChange.changedRecords.fieldIds.forEach((field) =>
        addFieldIdentity(meta.changedFieldIds, field)
      );
      originalChange.changedRecords.edgeIds.forEach((edgeId) => meta.changedEdgeIds.add(edgeId));
      meta.chatConfigChanged = meta.chatConfigChanged || originalChange.changedRecords.chatConfig;
      meta.chatConfigVariablesChanged =
        meta.chatConfigVariablesChanged || originalChange.changedRecords.chatConfigVariablesChanged;
      originalChange.affectedRecords.nodeIds.forEach((nodeId) => meta.affectedNodeIds.add(nodeId));
      originalChange.affectedRecords.fieldIds.forEach((field) =>
        addFieldIdentity(meta.affectedFieldIds, field)
      );
      meta.structureChanged = meta.structureChanged || originalChange.affectedRecords.structure;
    };

    for (let step = 0; step < steps; step++) {
      const entry = history.take(direction);
      if (!entry) break;
      applied++;
      workflowVersion++;
      // Content Revision 由 history 记录恢复，因此撤销回已保存内容会自然回到干净状态。
      contentRevision =
        direction === 'undo' ? entry.beforeContentRevision : entry.afterContentRevision;
      nodeView.applyHistoryViews(entry.viewChanges, direction);
      if (entry.kind === 'checkpoint') {
        document.setDocument(direction === 'undo' ? entry.before : entry.after);
        document.rebuildNodeIndex();
        semanticVersion++;
        document.rebuildGraphIndex();
        document.rebuildWorkflowStartIds();
        reference.clearFieldStatusCache();
        issue.rebuildIssues();
        reference.rebuildGraph();
        fieldSnapshotCache.clear();
        workflowIssuesCache = undefined;
      }
      // 事件粒度取最宽的一条：混入语义记录后不能再按 geometry 通知，否则数据订阅者收不到刷新。
      if (entry.change.kind === 'replace') meta.kind = 'replace';
      else if (meta.kind !== 'replace' && entry.change.kind === 'semantic') meta.kind = 'semantic';
      mergeReplayedChange(entry.change);
    }

    if (applied === 0)
      return { ok: false, error: getError('invalid_command', `Nothing to ${direction}`) };

    if (meta.kind === 'replace') {
      meta.structureChanged = true;
    } else {
      issue.addChangedIssueRecords(
        meta,
        previousIssues,
        new Set([...meta.affectedNodeIds, ...meta.changedNodeIds])
      );
    }
    const change = makeChange(meta, direction);
    pruneSnapshotCaches();
    publish(change);
    return { ok: true, change };
  };

  issue.rebuildIssues();

  const port: WorkflowRuntimePort = {
    getWorkflow: getWorkflowSnapshot,
    getWorkflowIssues,
    /** 返回不含 runtime-only state 的 canonical 深拷贝；runtime disposed 后拒绝读取。 */
    getWorkflowData: () => {
      ensureActive();
      const current = document.getDocument();
      return cloneValue(
        documentToCanonical({
          // 出站前压缩：内存里允许留冗余快照，导出的只保留来源仍缺失且仍有 consumer 的项。
          document: { ...current, referenceSnapshots: reference.compactSnapshots() },
          views: nodeView.getViews()
        })
      );
    },
    getNode: (nodeId) => getNodeSnapshot(nodeId),
    getNodeView: (nodeId) => {
      ensureActive();
      return nodeView.getNodeViewSnapshot(nodeId);
    },
    getField: getFieldSnapshot,
    getHistory: () => history.getSnapshot(),
    getSavepoint: () => {
      ensureActive();
      return freezeValue({
        contentRevision,
        isDirty: contentRevision !== savedRevision
      }) as WorkflowSavepoint;
    },
    markSaved: (revision) => {
      // 保存请求可能在 runtime 释放之后才回来；此时没有可回填的状态，忽略即可。
      if (disposed) return;
      savedRevision = revision;
    },
    getChangeLog: () => freezeValue([...changeLog]) as readonly WorkflowChange[],
    dispatch,
    replayHistory,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * Issue-only 刷新：按当前环境事实重算 Issue View。
     * Content Revision、History、Savepoint 与 dirty 一律不动，也不发布 Workflow Change；
     * Issue View 通过独立 gate 读取；普通 workflow snapshot identity 保持不变。
     */
    refreshIssues: (scope: WorkflowIssueScope = 'all') => {
      // 刷新可能由 host effect 在 runtime 释放后触发：此时没有可刷新的状态，静默返回空结果。
      if (disposed) return EMPTY_ISSUE_UPDATE;
      const { nodeIds, configChanged } = issue.refreshIssues(scope);
      if (nodeIds.length === 0 && !configChanged) return EMPTY_ISSUE_UPDATE;
      const update = freezeValue({ nodeIds }) as WorkflowIssueUpdate;
      issueListeners.forEach((listener) => {
        try {
          listener(update);
        } catch {
          // 一个订阅者失败不能阻止其他订阅者观察本次刷新。
        }
      });
      return update;
    },
    subscribeIssues: (listener) => {
      if (disposed) return () => undefined;
      issueListeners.add(listener);
      return () => issueListeners.delete(listener);
    },
    /**
     * placement context 是渲染路径上的只读派生：runtime 释放后返回 null（调用方按「不限制」处理），
     * 不与其他 getter 一样抛错，避免卸载竞态把页面打崩。
     */
    getPlacementContext: (request) => (disposed ? null : document.getPlacementContext(request)),
    /** 图查询对象身份恒定；释放后 Document 索引已清空，查询自然返回空结果，无需 disposed 分支。 */
    getGraphQueries: document.getGraphQueries,
    undo: () => replayHistory('undo'),
    redo: () => replayHistory('redo'),
    isDisposed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      issueListeners.clear();
      changeLog.length = 0;
      history.clear();
      nodeSnapshotCache.clear();
      edgeSnapshotCache.clear();
      fieldSnapshotCache.clear();
      workflowSnapshotCache = undefined;
      workflowIssuesCache = undefined;
      chatConfigSnapshotCache = undefined;
      nodeView.clear();
      reference.clear();
      issue.clear();
      document.clear();
    }
  };

  return port;
};
