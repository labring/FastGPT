import type {
  ChatCompletionMessageParam,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type {
  AIChatItemValueItemType,
  ContextCheckpointValueType
} from '@fastgpt/global/core/chat/type';
import type { AgentAskPayload } from '../systemTools/ask';
import type { AgentLoopToolChildrenInteractive } from './interactive';

export type AgentLoopResult<TChildrenResponse = unknown> = {
  status: 'done' | 'ask' | 'aborted' | 'error';
  answerText?: string;
  reasoningText?: string;
  activePlan?: AgentPlanType;
  providerState?: unknown;
  ask?: AgentAskPayload;
  askId?: string;
  completeMessages?: ChatCompletionMessageParam[];
  assistantMessages?: ChatCompletionMessageParam[];
  assistantResponses?: AIChatItemValueItemType[];
  interactiveResponse?: AgentLoopToolChildrenInteractive<TChildrenResponse>;
  requestIds: string[];
  contextCheckpoint?: ContextCheckpointValueType;
  finishReason?: CompletionFinishReason;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    llmTotalPoints: number;
  };
  error?: unknown;
};
