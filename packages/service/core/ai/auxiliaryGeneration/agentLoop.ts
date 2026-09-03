import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { runAgentLoop } from '../llm/agentLoop/interface';
import type { AgentLoopRuntime } from '../llm/agentLoop/interface';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AuxiliaryGenerationStreamWriter } from './stream';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { createChatCompletionDeltaResponse } from '@fastgpt/global/core/ai/llm/utils';
import type { LLMSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

type RunAuxiliaryGenerationAgentLoopParams = {
  teamId: string;
  model: LLMSystemModelDataType;
  systemPrompt: string;
  messages: ChatCompletionMessageParam[];
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  streamWriter?: AuxiliaryGenerationStreamWriter;
  checkIsStopping?: () => boolean;
  usageSink?: (usages: ChatNodeUsageType[]) => void;
  providerState?: unknown;
  userAnswer?: string;
  runtimeTools?: ChatCompletionTool[];
  executeTool?: AgentLoopRuntime['executeTool'];
};

/**
 * 运行辅助生成 Agent Loop。
 *
 * systemPrompt 作为调用方提供的最终提示词原样传入。该入口启用标准 ask_user，并允许
 * 业务方显式注入 runtime tools；不会隐式获得默认 Agent 提示词、workflow、Skill、计划
 * 或虚拟机执行能力。paused/providerState 等结果保持 Agent Loop 原语义。
 */
export async function runAuxiliaryGenerationAgentLoop({
  teamId,
  model,
  systemPrompt,
  messages,
  useVision,
  useAudio,
  useVideo,
  streamWriter,
  checkIsStopping,
  usageSink,
  providerState,
  userAnswer,
  runtimeTools = [],
  executeTool
}: RunAuxiliaryGenerationAgentLoopParams) {
  const result = await runAgentLoop({
    runtime: {
      teamId,
      llmParams: {
        model,
        stream: true,
        useVision,
        useAudio,
        useVideo
      },
      systemTools: {
        ask: { enabled: true }
      },
      toolCatalog: {
        runtimeTools
      },
      executeTool:
        executeTool ??
        (async () => {
          throw new Error('Auxiliary generation runtime tool executor is not configured');
        }),
      checkIsStopping,
      emitEvent: (event) => {
        if (event.type === 'reasoning_delta') {
          streamWriter?.({
            event: AuxiliaryGenerationEventEnum.answer,
            data: createChatCompletionDeltaResponse({ reasoningContent: event.text })
          });
        }
        if (event.type === 'answer_delta') {
          streamWriter?.({
            event: AuxiliaryGenerationEventEnum.answer,
            data: createChatCompletionDeltaResponse({ text: event.text })
          });
        }
      },
      usagePush: usageSink
    },
    input: {
      systemPrompt,
      messages,
      providerState,
      userAnswer
    }
  });

  const visibleAssistantMessages = result.assistantMessages.filter(
    (message) => message.role === 'assistant' && !message.tool_calls?.length
  );
  const answerText = visibleAssistantMessages
    .map((message) => {
      if (typeof message.content === 'string') return message.content;
      return message.content?.map((item) => (item.type === 'text' ? item.text : '')).join('') ?? '';
    })
    .join('');
  const reasoningText = visibleAssistantMessages
    .map((message) => message.reasoning_content ?? '')
    .join('');

  return {
    ...result,
    answerText,
    reasoningText
  };
}
