import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { AgentLoopProviderName } from '../../../../../../ai/llm/agentLoop/interface';

export type AgentLoopCoreMemoryKeys = {
  memoryKey: string;
};

export type AgentLoopCoreProviderStateMemory = {
  providerState?: unknown;
};

export type AgentLoopCorePiAgentProviderState = {
  piMessages?: unknown[];
  [key: string]: unknown;
};

/**
 * 生成当前节点的 agent-loop providerState memory key。
 * Workflow Agent 和简化 ToolCall 后续都可以复用同一个 key 规则。
 */
export const getAgentLoopCoreMemoryKeys = (nodeId: string): AgentLoopCoreMemoryKeys => ({
  memoryKey: `agentLoopMemory-${nodeId}`
});

export const getAgentLoopCorePiMessagesMemoryKey = (nodeId: string) => `piMessages-${nodeId}`;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const readObject = (value: unknown): Record<string, unknown> =>
  isObjectRecord(value) ? value : {};

export const readAgentLoopCorePiAgentProviderState = (
  providerState: unknown
): AgentLoopCorePiAgentProviderState => readObject(providerState);

/**
 * piAgent raw messages 过渡期兼容：统一 providerState 中不重复保存完整 raw messages，
 * 旧 key 仍作为单独 memory 写入和恢复。
 */
export const getAgentLoopCorePiAgentMemoryProviderState = (providerState: unknown) => {
  const state = readAgentLoopCorePiAgentProviderState(providerState);
  const { piMessages: _piMessages, ...memoryState } = state;

  return Object.keys(memoryState).length > 0 ? memoryState : undefined;
};

/**
 * 从上一条 AI history 中恢复 agent-loop providerState。
 * 只恢复 AI 轮次写入的 memories，避免把用户轮次误当成可继续执行的 loop 状态。
 */
export const readAgentLoopCoreProviderStateMemory = ({
  histories,
  nodeId
}: {
  histories: ChatItemMiniType[];
  nodeId: string;
}): AgentLoopCoreProviderStateMemory => {
  const keys = getAgentLoopCoreMemoryKeys(nodeId);
  const lastHistory = histories[histories.length - 1];
  if (!lastHistory || lastHistory.obj !== ChatRoleEnum.AI) {
    return {};
  }

  return (
    (lastHistory.memories?.[keys.memoryKey] as AgentLoopCoreProviderStateMemory | undefined) || {}
  );
};

/**
 * 将本轮 providerState 转换为 workflow memories。
 * 暂停态写入 providerState；完成态写 undefined，清理未完成状态。
 */
export const buildAgentLoopCoreProviderStateMemories = ({
  nodeId,
  memory
}: {
  nodeId: string;
  memory: AgentLoopCoreProviderStateMemory;
}) => {
  const keys = getAgentLoopCoreMemoryKeys(nodeId);
  const hasMemory = memory.providerState !== undefined;

  return {
    [keys.memoryKey]: hasMemory ? memory : undefined
  };
};

/**
 * 计算本轮传入 agent-loop 的 providerState。
 * piAgent 会兼容从旧 `piMessages-${nodeId}` memory 恢复 raw messages。
 */
export const prepareAgentLoopCoreProviderRunState = ({
  provider,
  restoredProviderState,
  histories,
  nodeId,
  hasLastInteractive
}: {
  provider: AgentLoopProviderName;
  restoredProviderState: unknown;
  histories: ChatItemMiniType[];
  nodeId: string;
  hasLastInteractive: boolean;
}) => {
  const piMessagesKey = getAgentLoopCorePiMessagesMemoryKey(nodeId);
  const lastHistory = histories[histories.length - 1];
  const restoredState = readObject(restoredProviderState);
  const piAgentState = readAgentLoopCorePiAgentProviderState(restoredProviderState);
  const runtimePiAgentState: AgentLoopCorePiAgentProviderState = {
    ...piAgentState,
    ...(provider === 'piAgent' && lastHistory?.obj === ChatRoleEnum.AI
      ? {
          piMessages:
            piAgentState.piMessages ||
            (lastHistory.memories?.[piMessagesKey] as unknown[] | undefined)
        }
      : {})
  };

  return {
    piMessagesKey,
    providerState: provider === 'piAgent' ? runtimePiAgentState : restoredProviderState,
    isAskResume:
      hasLastInteractive &&
      (provider === 'piAgent'
        ? Boolean(piAgentState.pendingAsk)
        : isObjectRecord(restoredState.pendingMainContext))
  };
};

/**
 * ask 暂停态 memory：非 piAgent 保存完整 providerState；piAgent 额外兼容写 raw messages 旧 key。
 */
export const buildAgentLoopCoreAskMemories = ({
  provider,
  nodeId,
  providerState,
  piMessagesKey
}: {
  provider: AgentLoopProviderName;
  nodeId: string;
  providerState: unknown;
  piMessagesKey: string;
}) => {
  if (provider !== 'piAgent') {
    return buildAgentLoopCoreProviderStateMemories({
      nodeId,
      memory: {
        providerState
      }
    });
  }

  return {
    ...buildAgentLoopCoreProviderStateMemories({
      nodeId,
      memory: {
        providerState: getAgentLoopCorePiAgentMemoryProviderState(providerState)
      }
    }),
    [piMessagesKey]: readAgentLoopCorePiAgentProviderState(providerState).piMessages
  };
};

/**
 * 完成态 memory：清理统一 providerState；piAgent 继续写 raw messages 旧 key 供下一轮兼容恢复。
 */
export const buildAgentLoopCoreDoneMemories = ({
  provider,
  nodeId,
  providerState,
  piMessagesKey
}: {
  provider: AgentLoopProviderName;
  nodeId: string;
  providerState: unknown;
  piMessagesKey: string;
}) => {
  if (provider !== 'piAgent') {
    return buildAgentLoopCoreProviderStateMemories({
      nodeId,
      memory: {}
    });
  }

  return {
    ...buildAgentLoopCoreProviderStateMemories({
      nodeId,
      memory: {}
    }),
    [piMessagesKey]: readAgentLoopCorePiAgentProviderState(providerState).piMessages
  };
};
