import { AsyncLocalStorage } from 'async_hooks';
import {
  ModerationActionEnum,
  type CheckContentByPolicyResult,
  type ModerationStageEnum,
  type NodeModerationRecordType
} from '@fastgpt/global/core/plugin/moderation/type';

const ModerationNodeCollectorStorage = new AsyncLocalStorage<NodeModerationRecordType[]>();
const RecordedResultWeakSet = new WeakSet<object>();

/**
 * 在单个工作流节点（或工作流入口）执行上下文中收集内容审核拦截记录
 */
export const runWithNodeModerationCollector = async <T>(
  fn: () => Promise<T>
): Promise<{
  result: T;
  moderationRecords: NodeModerationRecordType[];
}> => {
  const records: NodeModerationRecordType[] = [];
  const result = await ModerationNodeCollectorStorage.run(records, fn);
  return {
    result,
    moderationRecords: records
  };
};

/**
 * 在当前节点上下文中执行异步函数，无论成功或抛错均可通过回调获取已收集的拦截记录
 */
export const runWithNodeModerationContext = async <T>(
  records: NodeModerationRecordType[],
  fn: () => Promise<T>
): Promise<T> => {
  return ModerationNodeCollectorStorage.run(records, fn);
};

/**
 * 获取当前上下文已收集的节点审核拦截记录
 */
export const getCollectedNodeModerationRecords = (): NodeModerationRecordType[] => {
  return ModerationNodeCollectorStorage.getStore() ?? [];
};

/**
 * 向当前节点上下文追加一条审核拦截记录
 */
export const appendNodeModerationRecord = (
  record: NodeModerationRecordType,
  sourceResult?: object
): void => {
  const store = ModerationNodeCollectorStorage.getStore();
  if (!store) return;

  if (sourceResult) {
    if (RecordedResultWeakSet.has(sourceResult)) return;
    RecordedResultWeakSet.add(sourceResult);
  }

  store.push(record);
};

/**
 * 确保单次拦截判定结果已被记录到当前节点收集器中（兼容测试中直接 mock checkContentByPolicy 的场景）
 */
export const ensureNodeModerationRecord = (
  res: CheckContentByPolicyResult,
  fallback: {
    stage: `${ModerationStageEnum}` | ModerationStageEnum;
    targetField?: string;
    content?: string;
  }
): void => {
  if (res.action !== ModerationActionEnum.block) return;

  appendNodeModerationRecord(
    {
      stage: fallback.stage as ModerationStageEnum,
      targetField: fallback.targetField,
      verdict: res.verdict ?? 'block',
      actionTaken: ModerationActionEnum.block,
      hits: res.hits ?? [],
      keywords: res.keywords ?? [],
      content: res.text ?? fallback.content,
      errorMessage: res.errorMessage
    },
    res
  );
};
