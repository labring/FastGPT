import type {
  ChatCompletionMessageParam,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { AgentAskPayload } from './systemTool/ask';
import type { AgentLoopUsage } from './usage';

export type AgentLoopPause<TChildrenResponse = unknown> =
  | {
      type: 'ask';
      ask: AgentAskPayload;
      askId: string;
    }
  | {
      type: 'tool_child';
      childrenResponse: TChildrenResponse;
      toolCallId: string;
    };

export type AgentLoopResultStatus = 'done' | 'paused' | 'aborted' | 'error';

export type AgentLoopResultBase = {
  activePlan?: AgentPlanType;
  providerState?: unknown;
  completeMessages: ChatCompletionMessageParam[];
  assistantMessages: ChatCompletionMessageParam[];
  requestIds: string[];
  contextCheckpoint?: string;
  finishReason: CompletionFinishReason;
  usages: AgentLoopUsage[];
};

/**
 * 底层 agent-loop 只表达模型循环结果，不返回 workflow interactive/schema。
 * 暂停态统一通过 `pause` 承载，再由 workflow adapter/core 转成业务交互结构。
 */
export type AgentLoopResult<TChildrenResponse = unknown> =
  | (AgentLoopResultBase & {
      status: 'done';
      pause?: never;
      error?: never;
    })
  | (AgentLoopResultBase & {
      status: 'paused';
      pause: AgentLoopPause<TChildrenResponse>;
      error?: never;
    })
  | (AgentLoopResultBase & {
      status: 'aborted';
      pause?: never;
      error?: unknown;
    })
  | (AgentLoopResultBase & {
      status: 'error';
      pause?: never;
      error: unknown;
    });
