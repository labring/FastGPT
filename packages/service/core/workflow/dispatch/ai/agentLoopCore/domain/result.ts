import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type {
  AgentLoopPause,
  AgentLoopResultBase
} from '../../../../../ai/llm/agentLoop/interface';

type AgentLoopCoreResultBase = AgentLoopResultBase & {
  assistantResponses: AIChatItemValueItemType[];
};

/** Workflow 适配层将底层 paused 统一映射为 interactive。 */
export type AgentLoopCoreResult<TChildrenResponse = unknown> =
  | (AgentLoopCoreResultBase & {
      status: 'done';
      pause?: never;
      error?: never;
    })
  | (AgentLoopCoreResultBase & {
      status: 'interactive';
      pause: AgentLoopPause<TChildrenResponse>;
      error?: never;
    })
  | (AgentLoopCoreResultBase & {
      status: 'aborted';
      pause?: never;
      error?: unknown;
    })
  | (AgentLoopCoreResultBase & {
      status: 'error';
      pause?: never;
      error: unknown;
    });
