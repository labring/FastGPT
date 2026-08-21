import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { AgentLoopCoreToolDisplayInfo } from '../../domain/toolInfo';

export type BuildAgentLoopCoreAssistantResponsesFromMessagesParams = {
  messages: ChatCompletionMessageParam[];
  reserveTool?: boolean;
  reserveReason?: boolean;
  getToolInfo?: (name: string) => AgentLoopCoreToolDisplayInfo | undefined;
};
