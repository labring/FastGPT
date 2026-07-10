import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import {
  runUnifiedAgentLoop,
  createUpdatePlanTool,
  type AgentLoopEvent,
  type AgentLoopRuntime,
  type AgentLoopToolCatalog,
  type PendingMainContext
} from '../llm/agentLoop';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AuxiliaryGenerationStreamWriter } from './stream';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';

type RunAuxiliaryGenerationAgentLoopParams = {
  teamId: string;
  userKey?: OpenaiAccountType;
  model: string;
  systemPrompt: string;
  messages: ChatCompletionMessageParam[];
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  streamWriter?: AuxiliaryGenerationStreamWriter;
  checkIsStopping?: () => boolean;
  usageSink?: (usages: ChatNodeUsageType[]) => void;
  toolCatalog?: AgentLoopToolCatalog;
  executeTool?: AgentLoopRuntime['executeTool'];
  emitEvent?: (event: AgentLoopEvent) => void;
  streamAnswerDelta?: boolean;
  batchToolSize?: number;
  pendingMainContext?: PendingMainContext;
  userAnswer?: string;
};

/**
 * 运行辅助生成 Agent Loop。
 *
 * 默认不注册 runtime tools；需要工具能力的 scene 必须同时声明工具目录和执行器，
 * 避免模型可见工具却无法执行。
 */
export async function runAuxiliaryGenerationAgentLoop({
  teamId,
  userKey,
  model,
  systemPrompt,
  messages,
  useVision,
  useAudio,
  useVideo,
  streamWriter,
  checkIsStopping,
  usageSink,
  toolCatalog,
  executeTool,
  emitEvent,
  streamAnswerDelta = true,
  batchToolSize,
  pendingMainContext,
  userAnswer
}: RunAuxiliaryGenerationAgentLoopParams) {
  const resolvedToolCatalog =
    toolCatalog ??
    ({
      runtimeTools: [],
      updatePlanTool: createUpdatePlanTool()
    } satisfies AgentLoopToolCatalog);
  if (resolvedToolCatalog.runtimeTools.length > 0 && !executeTool) {
    throw new Error('Auxiliary generation runtime tools require executeTool');
  }

  const result = await runUnifiedAgentLoop({
    runtime: {
      teamId,
      userKey,
      model,
      stream: true,
      batchToolSize,
      useVision,
      useAudio,
      useVideo,
      toolCatalog: resolvedToolCatalog,
      executeTool:
        executeTool ??
        (async () => {
          throw new Error('Auxiliary generation does not support runtime tools');
        }),
      checkIsStopping,
      emitEvent: (event) => {
        emitEvent?.(event);
        if (!emitEvent) {
          if (streamAnswerDelta && event.type === 'answer_delta') {
            streamWriter?.(streamSseEvent.answerDelta(event.text));
          }
          if (event.type === 'reasoning_delta') {
            streamWriter?.(streamSseEvent.reasoningDelta(event.text));
          }
        }
      },
      usageSink
    },
    input: {
      systemPrompt,
      messages,
      pendingMainContext,
      userAnswer
    }
  });

  return {
    status: result.status,
    answerText: result.answerText ?? '',
    reasoningText: result.reasoningText,
    error: result.error,
    ask: result.ask,
    pendingMainContext: result.pendingMainContext
  };
}
