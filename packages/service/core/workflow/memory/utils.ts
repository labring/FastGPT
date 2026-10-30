import { cloneDeep } from 'lodash-es';
import { ChatRoleEnum, type ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';

export type WorkflowMemorySource = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
};

const LEGACY_AGENT_MEMORY_PREFIX = 'agentLoopMemory-';

/** 根来源的无前缀键是合法记忆，递归子流程不能把它当成旧子流程键。 */
const isRootMemoryKey = (key: string, rootSource?: WorkflowMemorySource): boolean =>
  rootSource !== undefined && key.startsWith(`${rootSource.sourceType}:${rootSource.sourceId}:`);

/**
 * 从末尾 AI 消息读取记忆快照；历史和 memories 来自持久化数据，保留格式校验及深拷贝边界。
 * 末尾为 Human、空历史或非法字典时返回空快照，不回溯到更早轮次。
 */
export const getHistoryWorkflowMemories = (histories?: ChatItemMiniType[]): Record<string, any> => {
  const lastHistory = histories?.at(-1);
  if (!lastHistory || lastHistory.obj !== ChatRoleEnum.AI || !lastHistory.memories) return {};
  if (typeof lastHistory.memories !== 'object' || Array.isArray(lastHistory.memories)) return {};
  return cloneDeep(lastHistory.memories);
};

/**
 * 统一构造节点记忆键；无来源的独立 Agent runner 保留旧键格式。
 * 当前应用身份已包含在节点键中，路径末尾的重复应用段只在生成键时省略，派生路径仍完整保留。
 */
export const getWorkflowMemoryKey = ({
  runningAppInfo,
  nodeId,
  scopePath = []
}: {
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
  scopePath?: readonly string[];
}): string => {
  const sourceKey = runningAppInfo
    ? `${runningAppInfo.sourceType}:${runningAppInfo.sourceId}`
    : undefined;
  const baseKey = sourceKey ? `${sourceKey}:${nodeId}` : `${LEGACY_AGENT_MEMORY_PREFIX}${nodeId}`;
  const nodeScopePath =
    sourceKey && scopePath.at(-1) === sourceKey ? scopePath.slice(0, -1) : scopePath;
  return nodeScopePath.length > 0 ? `${nodeScopePath.join('/')}/${baseKey}` : baseKey;
};

/**
 * 兼容读取历史基线中的旧子流程键和旧 Agent 键，返回值由运行状态的读取边界统一拷贝。
 * 同来源的递归实例不能回退到根记忆；来源不明的无前缀子流程键也不推测归属。
 */
export const readLegacyWorkflowMemory = ({
  baseline,
  runningAppInfo,
  nodeId,
  memoryKey,
  rootSource
}: {
  baseline: Record<string, any>;
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
  memoryKey: string;
  rootSource?: WorkflowMemorySource;
}): any => {
  const baseKey = getWorkflowMemoryKey({ runningAppInfo, nodeId });
  if (memoryKey !== baseKey && isRootMemoryKey(baseKey, rootSource)) return undefined;

  if (runningAppInfo && rootSource && memoryKey !== baseKey && Object.hasOwn(baseline, baseKey)) {
    const hasScopedMemory = Object.keys(baseline).some((key) => key.endsWith(`/${baseKey}`));
    if (!hasScopedMemory) return baseline[baseKey];
  }

  const legacyAgentKey = `${LEGACY_AGENT_MEMORY_PREFIX}${nodeId}`;
  return Object.hasOwn(baseline, legacyAgentKey) ? baseline[legacyAgentKey] : undefined;
};

/**
 * 合并记忆快照与增量，保留 undefined 删除标记，并清理确认被新键替代的旧格式键。
 * 调度状态和交互落库共用相同规则，rootSource 必须表示根会话；缺少来源时保守保留无前缀键。
 */
export const mergeWorkflowMemories = ({
  baseline,
  entries,
  rootSource
}: {
  baseline?: Record<string, any>;
  entries?: Record<string, any>;
  rootSource?: WorkflowMemorySource;
}): Record<string, any> => {
  const updates = entries ?? {};
  const record = cloneDeep({ ...baseline, ...updates });

  for (const memoryKey of Object.keys(updates)) {
    const baseKey = memoryKey.slice(memoryKey.lastIndexOf('/') + 1);
    if (memoryKey !== baseKey) {
      if (isRootMemoryKey(baseKey, rootSource)) continue;
      if (rootSource && !Object.hasOwn(updates, baseKey)) delete record[baseKey];
    }

    const firstColon = baseKey.indexOf(':');
    const secondColon = firstColon >= 0 ? baseKey.indexOf(':', firstColon + 1) : -1;
    if (secondColon < 0) continue;
    const legacyAgentKey = `${LEGACY_AGENT_MEMORY_PREFIX}${baseKey.slice(secondColon + 1)}`;
    if (!Object.hasOwn(updates, legacyAgentKey)) delete record[legacyAgentKey];
  }

  return record;
};
