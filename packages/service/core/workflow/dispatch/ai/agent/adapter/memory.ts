import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { PendingMainContext } from '../../../../../ai/llm/agentLoop';

export type WorkflowAgentLoopMemoryKeys = {
  memoryKey: string;
};

export type WorkflowAgentLoopMemory = {
  pendingMainContext?: PendingMainContext;
};

/**
 * 生成当前 agent 节点的记忆 key。
 * agent loop 状态统一收敛到一个 key，避免多入口各自写 memory。
 */
export const getWorkflowAgentLoopMemoryKeys = (nodeId: string): WorkflowAgentLoopMemoryKeys => ({
  memoryKey: `agentLoopMemory-${nodeId}`
});

/**
 * 从上一条 AI history 中恢复 agent-loop 状态。
 * 只恢复 AI 轮次写入的 memories，避免把用户轮次误当成可继续执行的 loop 状态。
 */
export const readWorkflowAgentLoopMemory = ({
  histories,
  nodeId
}: {
  histories: ChatItemMiniType[];
  nodeId: string;
}): WorkflowAgentLoopMemory => {
  const keys = getWorkflowAgentLoopMemoryKeys(nodeId);
  const lastHistory = histories[histories.length - 1];
  if (!lastHistory || lastHistory.obj !== ChatRoleEnum.AI) {
    return {};
  }

  return (lastHistory.memories?.[keys.memoryKey] as WorkflowAgentLoopMemory | undefined) || {};
};

/**
 * 将本轮 loop 状态转换为 workflow memories。
 * ask 状态会保存 pendingMainContext；正常完成时写 undefined，清理未完成状态。
 */
export const buildWorkflowAgentLoopMemories = ({
  nodeId,
  memory
}: {
  nodeId: string;
  memory: WorkflowAgentLoopMemory;
}) => {
  const keys = getWorkflowAgentLoopMemoryKeys(nodeId);
  const hasMemory = !!memory.pendingMainContext;

  return {
    [keys.memoryKey]: hasMemory ? memory : undefined
  };
};
