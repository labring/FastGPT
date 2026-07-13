import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { AgentLoopEvent } from '../../../../../../ai/llm/agentLoop/interface';

type AgentLoopCoreAssistantMetaEvent = Extract<
  AgentLoopEvent,
  {
    type: 'after_message_compress' | 'plan_operation' | 'ask_start' | 'stop_gate';
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

/**
 * 按 planId 保存最新完整计划快照。
 * 该快照仅用于聊天记录刷新后的 UI 恢复，不参与模型消息转换。
 */
const upsertPlanSnapshot = ({
  assistantResponses,
  plan
}: {
  assistantResponses: AIChatItemValueItemType[];
  plan: NonNullable<AIChatItemValueItemType['plan']>;
}) => {
  const responseIndex = assistantResponses.findIndex((item) => item.plan?.planId === plan.planId);
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

const upsertAssistantValueById = ({
  assistantResponses,
  value
}: {
  assistantResponses: AIChatItemValueItemType[];
  value: AIChatItemValueItemType;
}) => {
  if (!value.id) {
    assistantResponses.push(value);
    return;
  }

  const responseIndex = assistantResponses.findIndex((item) => item.id === value.id);
  if (responseIndex < 0) {
    assistantResponses.push(value);
    return;
  }

  assistantResponses[responseIndex] = {
    ...assistantResponses[responseIndex],
    ...value
  };
};

/**
 * 将 agent-loop 元事件写入 FastGPT assistantResponses。
 *
 * 这里保存两类结构化数据：
 * 1. 成功 plan_operation 的完整计划快照，仅供聊天 UI 刷新恢复。
 * 2. transcript 无法直接表达、但恢复 agent-loop 需要的 plan/ask/stop/checkpoint 记录。
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
    case 'stop_gate': {
      upsertAssistantValueById({
        assistantResponses,
        value: {
          id: event.id,
          agentStopGate: {
            id: event.id,
            reason: event.reason,
            feedback: event.feedback
          },
          hideInUI: true
        }
      });
      return;
    }
  }
};
