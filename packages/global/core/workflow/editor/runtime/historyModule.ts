import type { HistorySnapshot, WorkflowChange } from '../types';
import { freezeValue } from './kernel';
import type { HistoryEntry, MutationMeta, NodeViewChange, RuntimeDocument } from './types';

/**
 * History module：拥有 past/future 记录与有界历史。
 *
 * 语义事务用 checkpoint（事务前后两个数组壳，节点记录共享引用），纯几何事务只存视图 delta。
 * 两类记录都带事务前后的 Content Revision，replay 时一并恢复，
 * 因此撤销回已保存内容会自然回到干净状态。
 */

// region historyEntries History entry construction

const MAX_HISTORY = 200;

/** 把事务内登记的视图变化摊平成 history 记录；缺省一侧表示该侧节点不存在。 */
export const collectViewChanges = (meta: MutationMeta): NodeViewChange[] =>
  [...meta.nodeViewChanges].map(([nodeId, { before, after }]) => ({
    nodeId,
    ...(before ? { before } : {}),
    ...(after ? { after } : {})
  }));

/** 保留事务前后浅数组快照；节点记录本身保持共享，避免提交时扫描整个 document。 */
export const createHistoryEntry = ({
  before,
  after,
  viewChanges,
  beforeContentRevision,
  afterContentRevision,
  change
}: {
  before: RuntimeDocument;
  after: RuntimeDocument;
  viewChanges: NodeViewChange[];
  beforeContentRevision: number;
  afterContentRevision: number;
  change: WorkflowChange;
}): HistoryEntry => ({
  kind: 'checkpoint',
  before,
  after,
  viewChanges,
  beforeContentRevision,
  afterContentRevision,
  change
});

/** 纯 geometry 事务的 delta 记录：只有视图变化，Document 与语义派生状态都未参与本笔事务。 */
export const createGeometryHistoryEntry = ({
  viewChanges,
  beforeContentRevision,
  afterContentRevision,
  change
}: {
  viewChanges: NodeViewChange[];
  beforeContentRevision: number;
  afterContentRevision: number;
  change: WorkflowChange;
}): HistoryEntry => ({
  kind: 'delta',
  viewChanges,
  beforeContentRevision,
  afterContentRevision,
  change
});

// endregion

// region historyState History stack lifecycle

/** Create the Workflow History module. */
export const createHistoryModule = () => {
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];

  /** 记录一笔已提交事务；超出上限丢弃最旧记录，并清空 redo 分支。 */
  const push = (entry: HistoryEntry) => {
    past.push(entry);
    if (past.length > MAX_HISTORY) past.splice(0, past.length - MAX_HISTORY);
    future.length = 0;
  };

  /** 取出一条记录并搬到对侧栈；无记录时返回 undefined，由 Core 转成失败结果。 */
  const take = (direction: 'undo' | 'redo'): HistoryEntry | undefined => {
    const source = direction === 'undo' ? past : future;
    const target = direction === 'undo' ? future : past;
    const entry = source.pop();
    if (!entry) return undefined;
    target.push(entry);
    return entry;
  };

  /** 读取 history 的可观察计数，不暴露可逆操作记录。 */
  const getSnapshot = (): HistorySnapshot =>
    freezeValue({
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undoCount: past.length,
      redoCount: future.length
    }) as HistorySnapshot;

  const clear = () => {
    past.length = 0;
    future.length = 0;
  };

  return { push, take, getSnapshot, clear };
};

// endregion
