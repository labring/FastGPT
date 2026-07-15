import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { AgentLoopEvent } from '../../../../../../ai/llm/agentLoop/interface';

type AgentLoopCoreAssistantMetaEvent = Extract<
  AgentLoopEvent,
  {
    type: 'after_message_compress' | 'plan_operation' | 'ask_start';
  }
>;

export type AgentLoopCoreAssistantMetaEventNames = {
  updatePlanToolName?: string;
  askToolName?: string;
};

const findAgentPlanUpdateIndex = (assistantResponses: AIChatItemValueItemType[], callId: string) =>
  assistantResponses.findIndex((item) => item.agentPlanUpdate?.id === callId);

const upsertAgentPlanUpdate = ({
  assistantResponses,
  update
}: {
  assistantResponses: AIChatItemValueItemType[];
  update: NonNullable<AIChatItemValueItemType['agentPlanUpdate']>;
}) => {
  const responseIndex = findAgentPlanUpdateIndex(assistantResponses, update.id);
  if (responseIndex < 0) {
    assistantResponses.push({
      id: update.id,
      agentPlanUpdate: update
    });
    return;
  }

  assistantResponses[responseIndex] = {
    ...assistantResponses[responseIndex],
    agentPlanUpdate: {
      ...(assistantResponses[responseIndex].agentPlanUpdate || {}),
      ...update
    }
  };
};

/** 将 plan_operation 的最新完整状态收敛为独立 plan 快照。 */
const upsertPlanSnapshot = ({
  assistantResponses,
  plan
}: {
  assistantResponses: AIChatItemValueItemType[];
  plan: NonNullable<AIChatItemValueItemType['plan']>;
}) => {
  const responseIndex = assistantResponses.findIndex(
    (item) => Object.prototype.hasOwnProperty.call(item, 'plan') && item.plan !== undefined
  );
  if (responseIndex < 0) {
    assistantResponses.push({ plan });
    return;
  }

  assistantResponses[responseIndex] = {
    ...assistantResponses[responseIndex],
    plan,
    planStatus: undefined
  };
};

const findAgentAskIndex = (assistantResponses: AIChatItemValueItemType[], callId: string) =>
  assistantResponses.findIndex((item) => item.agentAsk?.id === callId);

const upsertAgentAsk = ({
  assistantResponses,
  ask
}: {
  assistantResponses: AIChatItemValueItemType[];
  ask: NonNullable<AIChatItemValueItemType['agentAsk']>;
}) => {
  const responseIndex = findAgentAskIndex(assistantResponses, ask.id);
  if (responseIndex < 0) {
    assistantResponses.push({
      id: ask.id,
      agentAsk: ask
    });
    return;
  }

  assistantResponses[responseIndex] = {
    ...assistantResponses[responseIndex],
    agentAsk: {
      ...(assistantResponses[responseIndex].agentAsk || {}),
      ...ask
    }
  };
};

/**
 * 将 agent-loop 元事件写入 FastGPT assistantResponses。
 *
 * plan 快照用于恢复 agent-loop 运行时状态；agentPlanUpdate 只用于还原工具调用历史。
 * agent-loop 输出层会只保留最后一条 plan 快照，并把完成态收敛成 null 终止标记。
 */
export const appendAgentLoopCoreAssistantResponseFromEvent = ({
  assistantResponses,
  event,
  names = {}
}: {
  assistantResponses: AIChatItemValueItemType[];
  event: AgentLoopCoreAssistantMetaEvent;
  names?: AgentLoopCoreAssistantMetaEventNames;
}) => {
  switch (event.type) {
    case 'after_message_compress': {
      if (!event.contextCheckpoint) return;
      assistantResponses.push({
        contextCheckpoint: event.contextCheckpoint,
        hideInUI: true
      });
      return;
    }
    case 'plan_operation': {
      if (event.success) {
        upsertPlanSnapshot({
          assistantResponses,
          plan: event.plan
        });
      }
      if (!event.id) return;
      upsertAgentPlanUpdate({
        assistantResponses,
        update: {
          id: event.id,
          functionName: names.updatePlanToolName || 'update_plan',
          params: event.params || '',
          response: event.message
        }
      });
      return;
    }
    case 'ask_start': {
      if (!event.id) return;
      upsertAgentAsk({
        assistantResponses,
        ask: {
          id: event.id,
          askId: event.id,
          functionName: names.askToolName || 'ask_user',
          params: event.params || ''
        }
      });
      return;
    }
  }
};
