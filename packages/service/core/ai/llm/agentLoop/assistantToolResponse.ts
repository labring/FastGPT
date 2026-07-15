import type {
  AIChatItemValueItemType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';

type AgentPlanUpdateResponse = NonNullable<AIChatItemValueItemType['agentPlanUpdate']>;
type AgentAskResponse = NonNullable<AIChatItemValueItemType['agentAsk']>;

/**
 * 在 assistantResponses 中查找指定工具调用对应的 chat value 下标。
 *
 * Agent loop 的多个入口都会把 tool_call/tool_params/tool_response 分阶段写入同一个
 * ToolModuleResponseItemType。这里统一查找逻辑，避免不同入口对重复工具事件的覆盖行为不一致。
 */
const findAgentLoopToolResponseIndex = ({
  assistantResponses,
  callId
}: {
  assistantResponses: AIChatItemValueItemType[];
  callId: string;
}) => assistantResponses.findIndex((item) => item.tools?.some((tool) => tool.id === callId));

/**
 * 按 id 替换已有工具卡片；不存在时追加。
 */
const replaceOrAppendAgentLoopTool = (
  tools: ToolModuleResponseItemType[] | null | undefined,
  tool: ToolModuleResponseItemType
) => {
  if (!tools?.length) return [tool];

  const hasTool = tools.some((item) => item.id === tool.id);
  return hasTool ? tools.map((item) => (item.id === tool.id ? tool : item)) : tools.concat(tool);
};

/**
 * 新建或更新 assistantResponses 中的工具卡片。
 */
export const upsertAgentLoopToolResponse = ({
  assistantResponses,
  tool
}: {
  assistantResponses: AIChatItemValueItemType[];
  tool: ToolModuleResponseItemType;
}) => {
  const responseIndex = findAgentLoopToolResponseIndex({
    assistantResponses,
    callId: tool.id
  });
  if (responseIndex < 0) {
    assistantResponses.push({
      id: tool.id,
      tools: [tool]
    });
    return;
  }

  const currentValue = assistantResponses[responseIndex];
  assistantResponses[responseIndex] = {
    ...currentValue,
    tools: replaceOrAppendAgentLoopTool(currentValue.tools, tool)
  };
};

/**
 * 增量更新 assistantResponses 中已有的工具卡片。
 *
 * 如果 tool_call 事件未先到达，调用方通常不应凭 tool_params/tool_response 创建残缺工具卡片，
 * 因此这里找不到时直接返回 false。
 */
export const updateAgentLoopToolResponse = ({
  assistantResponses,
  callId,
  updater
}: {
  assistantResponses: AIChatItemValueItemType[];
  callId: string;
  updater: (tool: ToolModuleResponseItemType) => ToolModuleResponseItemType;
}) => {
  const responseIndex = findAgentLoopToolResponseIndex({
    assistantResponses,
    callId
  });
  const currentValue = responseIndex >= 0 ? assistantResponses[responseIndex] : undefined;
  const currentTool = currentValue?.tools?.find((tool) => tool.id === callId);
  if (!currentValue || !currentTool) return false;

  assistantResponses[responseIndex] = {
    ...currentValue,
    tools: replaceOrAppendAgentLoopTool(currentValue.tools, updater(currentTool))
  };
  return true;
};

/**
 * 创建 agent-loop 内部控制工具的持久化状态仓库。
 *
 * update_plan 和 ask_agent 不展示成普通工具卡，但必须保留 tool call 参数、响应以及同轮
 * assistant 文本，供刷新恢复和下一轮 chats2GPTMessages 重建完整工具协议。
 */
export const createAgentLoopControlToolResponseStore = (
  assistantResponses: AIChatItemValueItemType[]
) => {
  const findPlanUpdateIndex = (callId: string) =>
    assistantResponses.findIndex((item) => item.agentPlanUpdate?.id === callId);
  const findAskIndex = (callId: string) =>
    assistantResponses.findIndex((item) => item.agentAsk?.id === callId);

  const upsertPlanUpdate = (update: AgentPlanUpdateResponse) => {
    const responseIndex = findPlanUpdateIndex(update.id);
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
        ...(assistantResponses[responseIndex].agentPlanUpdate ?? {}),
        ...update
      }
    };
  };

  const updatePlanUpdate = (
    callId: string,
    updater: (update: AgentPlanUpdateResponse) => AgentPlanUpdateResponse
  ) => {
    const responseIndex = findPlanUpdateIndex(callId);
    const currentValue = responseIndex >= 0 ? assistantResponses[responseIndex] : undefined;
    if (!currentValue?.agentPlanUpdate) return;

    assistantResponses[responseIndex] = {
      ...currentValue,
      agentPlanUpdate: updater(currentValue.agentPlanUpdate)
    };
  };

  const upsertAsk = (ask: AgentAskResponse) => {
    const responseIndex = findAskIndex(ask.id);
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
        ...(assistantResponses[responseIndex].agentAsk ?? {}),
        ...ask
      }
    };
  };

  const updateAsk = (callId: string, updater: (ask: AgentAskResponse) => AgentAskResponse) => {
    const responseIndex = findAskIndex(callId);
    const currentValue = responseIndex >= 0 ? assistantResponses[responseIndex] : undefined;
    if (!currentValue?.agentAsk) return;

    assistantResponses[responseIndex] = {
      ...currentValue,
      agentAsk: updater(currentValue.agentAsk)
    };
  };

  return {
    upsertPlanUpdate,
    updatePlanUpdate,
    upsertAsk,
    updateAsk
  };
};
