import { AgentPlanReadSchema, type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { hasUnfinishedAgentPlan } from '@fastgpt/global/core/ai/agent/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemValueItemType, ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { AgentAskPayload } from '../../llm/agentLoop/interface';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

const SKILL_DEBUG_AGENT_NODE_ID = 'skill-debug-agent';

type SkillDebugAgentLoopMemory = {
  providerState?: unknown;
};

export const getSkillDebugAgentLoopMemoryKey = () => `agentLoopMemory-${SKILL_DEBUG_AGENT_NODE_ID}`;

/** 从最后一条 AI history 恢复 Agent Loop 的 opaque providerState。 */
export const readSkillDebugAgentLoopMemory = ({
  histories
}: {
  histories: ChatItemMiniType[];
}): SkillDebugAgentLoopMemory => {
  const lastHistory = histories.at(-1);
  if (!lastHistory || lastHistory.obj !== ChatRoleEnum.AI) return {};

  const memory = lastHistory.memories?.[getSkillDebugAgentLoopMemoryKey()];
  if (!memory || typeof memory !== 'object') return {};
  return memory as SkillDebugAgentLoopMemory;
};

/** 暂停态保存 providerState，完成态写 undefined 清理未完成状态。 */
export const buildSkillDebugAgentLoopMemories = (providerState?: unknown) => ({
  [getSkillDebugAgentLoopMemoryKey()]:
    providerState !== undefined
      ? {
          providerState
        }
      : undefined
});

/** 从聊天历史读取最后一个未完成计划，完成或 null 计划会阻止恢复更早状态。 */
export const readSkillDebugActivePlan = ({
  histories
}: {
  histories: ChatItemMiniType[];
}): AgentPlanType | undefined => {
  for (let historyIndex = histories.length - 1; historyIndex >= 0; historyIndex--) {
    const history = histories[historyIndex];
    if (history.obj !== ChatRoleEnum.AI) continue;

    for (let valueIndex = history.value.length - 1; valueIndex >= 0; valueIndex--) {
      const value = history.value[valueIndex];
      if (!Object.prototype.hasOwnProperty.call(value, 'plan')) continue;
      if (value.plan === null) return;

      const parsedPlan = AgentPlanReadSchema.safeParse(value.plan);
      if (!parsedPlan.success) return;
      return hasUnfinishedAgentPlan(parsedPlan.data) ? parsedPlan.data : undefined;
    }
  }
};

/** 只保留最后一个计划快照；完成计划保存 null 终止标记。 */
export const compactSkillDebugPlanSnapshots = (
  assistantResponses: AIChatItemValueItemType[]
): AIChatItemValueItemType[] => {
  const lastPlanIndex = assistantResponses.findLastIndex(
    (value) => Object.prototype.hasOwnProperty.call(value, 'plan') && value.plan !== undefined
  );
  if (lastPlanIndex < 0) return assistantResponses;

  return assistantResponses.flatMap((value, index) => {
    if (!Object.prototype.hasOwnProperty.call(value, 'plan') || value.plan === undefined) {
      return [value];
    }

    const valueWithoutPlan = Object.fromEntries(
      Object.entries(value).filter(
        ([key, itemValue]) => key !== 'plan' && itemValue !== undefined && itemValue !== null
      )
    ) as AIChatItemValueItemType;
    if (index === lastPlanIndex) {
      const plan = value.plan === null || !hasUnfinishedAgentPlan(value.plan) ? null : value.plan;
      return [{ ...valueWithoutPlan, plan }];
    }

    const hasSemanticValue = Object.entries(valueWithoutPlan).some(
      ([key, itemValue]) => key !== 'id' && itemValue !== undefined && itemValue !== null
    );
    return hasSemanticValue ? [valueWithoutPlan] : [];
  });
};

/** 将 Agent Loop ask 暂停结果转换成 ChatBox 可恢复交互。 */
export const createSkillDebugAskInteractive = ({
  askId,
  ask,
  usageId
}: {
  askId: string;
  ask: AgentAskPayload;
  usageId: string;
}): WorkflowInteractiveResponseType => ({
  type: 'agentAsk',
  askId,
  usageId,
  entryNodeIds: [],
  memoryEdges: [],
  nodeOutputs: [],
  params: {
    description: ask.reason,
    questions: ask.questions.map((question) => ({
      ...question,
      answer: ''
    }))
  }
});
