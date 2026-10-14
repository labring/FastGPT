import type { NodeViewState, WorkflowCommandError, WorkflowNodeViewSnapshot } from '../types';
import { cloneValue, freezeValue, getError, isObject, valuesEqual } from './kernel';
import type {
  DocumentReadApi,
  GeometryCommand,
  GeometryStageResult,
  MutationMeta,
  NodeViewChange,
  NodeViewStore,
  TransactionContext
} from './types';

/**
 * Node View module：拥有 position/isFolded 的存储、合并规则、geometry 命令校验与 reduce，
 * 以及 Node View scoped snapshot 缓存。
 *
 * 视图与 Node Data 分开存储，因此纯 geometry 事务完全不触碰 Document 的节点记录与索引，
 * 语义事务也只在节点视图真的变化时登记一条视图变化。
 */

// region viewState Node view state operations

export const mergeNodeView = ({
  current,
  position,
  isFolded
}: {
  current: NodeViewState;
  position?: { x: number; y: number };
  isFolded?: boolean;
}): NodeViewState => ({
  ...current,
  ...(position ? { position: cloneValue(position) } : {}),
  ...(isFolded !== undefined ? { isFolded } : {})
});

/** 读取事务内节点视图；缺失时回落到空视图，保证 merge 有确定输入。 */
export const getStagedNodeView = (views: NodeViewStore, nodeId: string): NodeViewState =>
  views.get(nodeId) ?? {};

/** 登记一次视图变化；同一事务内多次写同一节点时保留最初的 before。 */
const recordNodeViewChange = ({
  meta,
  nodeId,
  before,
  after
}: {
  meta: MutationMeta;
  nodeId: string;
  before?: NodeViewState;
  after?: NodeViewState;
}) => {
  if (valuesEqual(before, after)) return;
  const previous = meta.nodeViewChanges.get(nodeId);
  const initialBefore = previous ? previous.before : before;
  if (!initialBefore && !after) {
    meta.nodeViewChanges.delete(nodeId);
    return;
  }
  meta.nodeViewChanges.set(nodeId, { before: initialBefore, after });
};

/** 事务内写入一个节点视图；值相等时保留原对象，维持 scoped snapshot 的身份稳定。 */
export const setStagedNodeView = ({
  meta,
  views,
  nodeId,
  view
}: {
  meta: MutationMeta;
  views: NodeViewStore;
  nodeId: string;
  view: NodeViewState;
}) => {
  const before = views.get(nodeId);
  const next = before !== undefined && valuesEqual(before, view) ? before : view;
  views.set(nodeId, next);
  recordNodeViewChange({ meta, nodeId, before, after: next });
};

/** 事务内删除节点视图；节点被删除时调用，history 据此把视图一并恢复。 */
export const deleteStagedNodeView = ({
  meta,
  views,
  nodeId
}: {
  meta: MutationMeta;
  views: NodeViewStore;
  nodeId: string;
}) => {
  if (!views.has(nodeId)) return;
  const before = views.get(nodeId);
  views.delete(nodeId);
  recordNodeViewChange({ meta, nodeId, before, after: undefined });
};

/** 整文档替换：用新视图存储整体替换 staged 视图，只登记真正有差异的节点。 */
export const replaceStagedNodeViews = ({
  meta,
  views,
  next
}: {
  meta: MutationMeta;
  views: NodeViewStore;
  next: NodeViewStore;
}) => {
  // 先按替换前的视图登记差异，再整体落盘。
  const resolved: NodeViewStore = new Map();
  new Set([...views.keys(), ...next.keys()]).forEach((nodeId) => {
    const before = views.get(nodeId);
    const candidate = next.get(nodeId);
    const after =
      before !== undefined && candidate !== undefined && valuesEqual(before, candidate)
        ? before
        : candidate;
    if (after) resolved.set(nodeId, after);
    recordNodeViewChange({ meta, nodeId, before, after });
  });
  views.clear();
  resolved.forEach((view, nodeId) => views.set(nodeId, view));
};

// endregion

// region geometryValidation Node view command validation

/** 校验 geometry command 的数值边界；纯 geometry 与混合事务共用此规则。 */
const validateGeometryCommand = (command: GeometryCommand): WorkflowCommandError | undefined => {
  if (
    command.position !== undefined &&
    (!isObject(command.position) ||
      typeof command.position.x !== 'number' ||
      !Number.isFinite(command.position.x) ||
      typeof command.position.y !== 'number' ||
      !Number.isFinite(command.position.y))
  ) {
    return getError('invalid_command', 'Geometry position must contain finite x and y');
  }
  if (command.isFolded !== undefined && typeof command.isFolded !== 'boolean') {
    return getError('invalid_command', 'Geometry isFolded must be a boolean');
  }
  return undefined;
};

// endregion

// region viewModule Node view module assembly

/** Create the Workflow Node View module. */
export const createNodeViewModule = ({
  document,
  views: initialViews
}: {
  document: DocumentReadApi;
  views: NodeViewStore;
}) => {
  let views = initialViews;
  const nodeViewSnapshotCache = new Map<
    string,
    { view: NodeViewState; snapshot: WorkflowNodeViewSnapshot }
  >();

  /** 已提交视图存储；Runtime Core 用它复制事务副本并组装 canonical 数据。 */
  const getViews = () => views;

  /** 接管一份 staged 视图存储；事务失败时不会被调用。 */
  const commitViews = (next: NodeViewStore) => {
    views = next;
  };

  /** 混合事务中的 geometry reduce：只写 staged 视图，不触碰 Document。 */
  const reduceGeometryCommand = (
    { working, views: stagedViews, meta }: TransactionContext,
    command: GeometryCommand
  ) => {
    const validationError = validateGeometryCommand(command);
    if (validationError) throw validationError;
    const index = document.getWorkingNodeIndex({ working, nodeId: command.nodeId, meta });
    if (index < 0) throw getError('not_found', `Node not found: ${command.nodeId}`);
    setStagedNodeView({
      meta,
      views: stagedViews,
      nodeId: command.nodeId,
      view: mergeNodeView({
        current: getStagedNodeView(stagedViews, command.nodeId),
        position: command.position,
        isFolded: command.isFolded
      })
    });
  };

  /**
   * 纯 geometry 事务的 staging：只读已提交视图，先校验全部命令再落盘，
   * 并把变更登记到传入的 meta。没有实际变化时不返回 views，由 Runtime Core 转成 no-op 结果。
   */
  const stageGeometryBatch = (
    commands: readonly GeometryCommand[],
    meta: MutationMeta
  ): GeometryStageResult => {
    const nodeIndex = document.getNodeIndex();
    const nextViews = new Map<string, NodeViewState>();

    for (const command of commands) {
      if (!nodeIndex.has(command.nodeId)) {
        return { ok: false, error: getError('not_found', `Node not found: ${command.nodeId}`) };
      }
      const validationError = validateGeometryCommand(command);
      if (validationError) return { ok: false, error: validationError };

      nextViews.set(
        command.nodeId,
        mergeNodeView({
          current: nextViews.get(command.nodeId) ?? getStagedNodeView(views, command.nodeId),
          position: command.position,
          isFolded: command.isFolded
        })
      );
    }

    if (nextViews.size === 0) return { ok: true };
    const staged = new Map(views);
    nextViews.forEach((view, nodeId) => setStagedNodeView({ meta, views: staged, nodeId, view }));
    return meta.nodeViewChanges.size > 0 ? { ok: true, views: staged } : { ok: true };
  };

  /** undo/redo 时按 history 记录恢复视图；delta 与 checkpoint 共用同一条路径。 */
  const applyHistoryViews = (
    changes: readonly NodeViewChange[],
    direction: 'undo' | 'redo',
    targetViews: NodeViewStore = views
  ) => {
    changes.forEach(({ nodeId, before, after }) => {
      const view = direction === 'undo' ? before : after;
      if (view) targetViews.set(nodeId, view);
      else targetViews.delete(nodeId);
    });
  };

  /** 恢复事务前的视图存储；失败回滚与 history 预演共用。 */
  const restoreViews = (nextViews: NodeViewStore) => {
    views = nextViews;
    pruneSnapshotCache();
  };

  /** 返回 Node View State scoped snapshot；同一视图记录保持对象身份稳定。 */
  const getNodeViewSnapshot = (nodeId: string): WorkflowNodeViewSnapshot | undefined => {
    const view = views.get(nodeId);
    if (!view) return undefined;
    const cached = nodeViewSnapshotCache.get(nodeId);
    if (cached?.view === view) return cached.snapshot;
    const snapshot = freezeValue(cloneValue(view)) as WorkflowNodeViewSnapshot;
    nodeViewSnapshotCache.set(nodeId, { view, snapshot });
    return snapshot;
  };

  /** 丢弃视图记录已被替换或已不存在的缓存项，保持 snapshot identity 与当前状态一致。 */
  const pruneSnapshotCache = () => {
    nodeViewSnapshotCache.forEach((cached, nodeId) => {
      if (views.get(nodeId) !== cached.view) nodeViewSnapshotCache.delete(nodeId);
    });
  };

  const clear = () => {
    views.clear();
    nodeViewSnapshotCache.clear();
  };

  const getState = () => ({
    views: new Map(views),
    snapshotCache: new Map(nodeViewSnapshotCache)
  });

  const restoreState = (state: ReturnType<typeof getState>) => {
    views = new Map(state.views);
    nodeViewSnapshotCache.clear();
    state.snapshotCache.forEach((value, nodeId) => nodeViewSnapshotCache.set(nodeId, value));
  };

  return {
    getViews,
    getState,
    restoreState,
    commitViews,
    restoreViews,
    applyHistoryViews,
    reduceGeometryCommand,
    stageGeometryBatch,
    getNodeViewSnapshot,
    pruneSnapshotCache,
    clear
  };
};

// endregion
