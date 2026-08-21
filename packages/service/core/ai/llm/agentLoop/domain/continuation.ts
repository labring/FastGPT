import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

/**
 * 标准消息格式的跨请求 Agent continuation。
 *
 * 交互暂停不应依赖具体 provider 的原生消息格式；恢复时由 provider
 * 将这条标准消息链转换成自己的上下文，并补回 ask tool response。
 */
export type AgentLoopPendingMainContext = {
  messages: ChatCompletionMessageParam[];
  askToolCallId: string;
  activePlan?: AgentPlanType;
};
