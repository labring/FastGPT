import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { AgentLoopChildrenInteractiveParams } from './interactive';

export type AgentLoopInput<TChildrenResponse = unknown> = {
  messages: ChatCompletionMessageParam[];
  systemPrompt?: string;
  activePlan?: AgentPlanType;
  providerState?: unknown;
  userAnswer?: string;
  childrenInteractiveParams?: AgentLoopChildrenInteractiveParams<TChildrenResponse>;
};
