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

/**
 * 描述一次跨请求恢复动作。
 *
 * providerState 只保存暂停上下文；continuation 携带本次恢复的用户决策，
 * 以及必须在 tool response 之后继续消费的标准消息。
 */
export type AgentLoopContinuation = {
  type: 'ask';
  answer: string;
  additionalMessages?: ChatCompletionMessageParam[];
};
