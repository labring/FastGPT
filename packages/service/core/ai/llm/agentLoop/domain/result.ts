import type {
  ChatCompletionMessageParam,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { AgentAskInteractive } from '@fastgpt/global/core/ai/agent/type';
import type { AgentLoopUsage } from './usage';

/** 工具暂停只携带原调用关联及业务交互，Loop 不分类或包装工作流状态。 */
export type AgentLoopPause<TInteractive = unknown> = {
  toolCallId: string;
  interactive: AgentAskInteractive | TInteractive;
};

export type AgentLoopResultStatus = 'done' | 'paused' | 'aborted' | 'error';

export type AgentLoopResultBase = {
  activePlan?: AgentPlanType;
  providerState?: unknown;
  completeMessages: ChatCompletionMessageParam[];
  assistantMessages: ChatCompletionMessageParam[];
  requestIds: string[];
  firstTokenTime?: number;
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
