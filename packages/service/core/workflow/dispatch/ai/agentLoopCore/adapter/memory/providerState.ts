import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  getWorkflowNodeMemoryKey,
  readWorkflowNodeMemory,
  type WorkflowMemoryState
} from '../../../../../memory/state';
import type { WorkflowMemorySource } from '../../../../../memory/utils';

export type AgentLoopCoreProviderStateMemory = {
  providerState?: unknown;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * 从当前工作流记忆状态（或上一条 AI history）中恢复 agent-loop providerState。
 * 普通请求遵守 history 配置且只读取 AI 轮次；显式交互恢复优先使用父流程传入的 checkpoint，
 * 避免子应用的空历史或 history=0 裁掉恢复状态。
 * 同时通过 WorkflowMemoryState 自动兼容旧版 `agentLoopMemory-${nodeId}` 键格式。
 */
export const readAgentLoopCoreProviderStateMemory = ({
  memoryState,
  history,
  hasInteractiveResume = false,
  histories,
  runningAppInfo,
  nodeId
}: {
  memoryState?: WorkflowMemoryState;
  history?: ChatItemMiniType[] | number;
  hasInteractiveResume?: boolean;
  histories: ChatItemMiniType[];
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
}): AgentLoopCoreProviderStateMemory => {
  const selectedHistories = Array.isArray(history) ? history : histories;
  if (
    !(hasInteractiveResume && memoryState) &&
    selectedHistories.length > 0 &&
    selectedHistories.at(-1)?.obj !== ChatRoleEnum.AI
  )
    return {};

  const storedMemory = readWorkflowNodeMemory({
    memoryState,
    history,
    histories,
    hasInteractiveResume,
    runningAppInfo,
    nodeId
  });
  if (!isObjectRecord(storedMemory)) return {};

  return { providerState: storedMemory.providerState };
};

/**
 * 计算本轮传入 agent-loop 的 providerState。
 */
export const prepareAgentLoopCoreProviderRunState = ({
  restoredProviderState,
  hasLastInteractive
}: {
  restoredProviderState: unknown;
  hasLastInteractive: boolean;
}) => {
  return {
    providerState: restoredProviderState,
    isAskResume:
      hasLastInteractive &&
      isObjectRecord(restoredProviderState) &&
      isObjectRecord(restoredProviderState.pendingMainContext)
  };
};

/**
 * 暂停态 memory 统一保存完整 providerState。
 */
export const buildAgentLoopCorePausedMemories = ({
  memoryState,
  runningAppInfo,
  nodeId,
  providerState
}: {
  memoryState?: WorkflowMemoryState;
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
  providerState: unknown;
}) => ({
  [getWorkflowNodeMemoryKey({ memoryState, runningAppInfo, nodeId })]:
    providerState === undefined ? undefined : { providerState }
});

/**
 * 完成态 memory：统一清理未完成的 providerState。
 * 新一轮的 active plan 从 ChatItem history 恢复，不在 memory 中建立第二份状态。
 */
export const buildAgentLoopCoreDoneMemories = ({
  memoryState,
  runningAppInfo,
  nodeId
}: {
  memoryState?: WorkflowMemoryState;
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
}) => ({
  [getWorkflowNodeMemoryKey({ memoryState, runningAppInfo, nodeId })]: undefined
});
