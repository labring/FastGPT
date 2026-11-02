import { type AgentAskInteractive } from '@fastgpt/global/core/ai/agent/type';

/**
 * 将 Ask 原始调用封装为 interactive；展示字段在消费时解析，不重复保存或序列化。
 */
export const createAgentLoopCoreAskInteractive = ({
  toolCallId,
  arguments: argumentsText
}: {
  toolCallId: string;
  arguments: string;
}): AgentAskInteractive => ({
  type: 'agentAsk',
  params: {
    toolCallId,
    arguments: argumentsText
  }
});
