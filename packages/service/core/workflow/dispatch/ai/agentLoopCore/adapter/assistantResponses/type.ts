import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

export type AgentLoopCoreAssistantToolInfo = {
  name: string;
  avatar?: string;
};

export type BuildAgentLoopCoreAssistantResponsesFromMessagesParams = {
  messages: ChatCompletionMessageParam[];
  reserveTool?: boolean;
  reserveReason?: boolean;
  getToolInfo?: (name: string) => AgentLoopCoreAssistantToolInfo | undefined;
};
