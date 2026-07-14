import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { AgentPlanReadSchema } from '@fastgpt/global/core/ai/agent/type';
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
 * 从上一条 AI history 中恢复 agent-loop providerState。
 * 只恢复 AI 轮次写入的 memories，避免把用户轮次误当成可继续执行的 loop 状态。
 * 升级前的 fastAgent memory 直接保存 pendingMainContext，这里只读包装并迁移旧计划结构。
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

  const storedMemory = lastHistory.memories?.[keys.memoryKey];
  if (!isObjectRecord(storedMemory)) return {};

  if (storedMemory.providerState !== undefined) {
    return {
      providerState: storedMemory.providerState
    };
  }

  const pendingMainContext = readObject(storedMemory.pendingMainContext);
  if (!Object.keys(pendingMainContext).length) return {};

  const activePlan = AgentPlanReadSchema.safeParse(pendingMainContext.activePlan);
  return {
    providerState: {
      pendingMainContext: {
        ...pendingMainContext,
        ...(pendingMainContext.activePlan === undefined
          ? {}
          : { activePlan: activePlan.success ? activePlan.data : undefined })
      }
    }
  };
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
            piAgentState.piMessages ??
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
 * 暂停态 memory 统一保存完整 providerState。
 * piAgent 的 raw messages 属于 provider 私有状态，新写入不得再拆到旧 `piMessages-${nodeId}` key。
 */
export const buildAgentLoopCorePausedMemories = ({
  nodeId,
  providerState
}: {
  nodeId: string;
  providerState: unknown;
}) =>
  buildAgentLoopCoreProviderStateMemories({
    nodeId,
    memory: {
      providerState
    }
  });

/**
 * 完成态 memory：统一清理 providerState 和 pi raw messages。
 * 新一轮必须从受 history/checkpoint 约束的标准聊天历史重建上下文。
 */
export const buildAgentLoopCoreDoneMemories = ({
  provider,
  nodeId,
  piMessagesKey
}: {
  provider: AgentLoopProviderName;
  nodeId: string;
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
    [piMessagesKey]: undefined
  };
};
