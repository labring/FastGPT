import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { AgentLoopCoreToolDisplayInfo } from '../../domain/toolInfo';

export type BuildAgentLoopCoreAssistantResponsesFromMessagesParams = {
  messages: ChatCompletionMessageParam[];
  reserveTool?: boolean;
  reserveReason?: boolean;
  /**
   * 是否保留未匹配的 tool message。只有子工作流暂停并需要恢复上下文时需要保留；
   * 完成态过滤掉它们，避免被渲染成没有工具名称的空 tool 卡片。
   */
  preserveStandaloneToolResponses?: boolean;
  getToolInfo?: (name: string) => AgentLoopCoreToolDisplayInfo | undefined;
};
