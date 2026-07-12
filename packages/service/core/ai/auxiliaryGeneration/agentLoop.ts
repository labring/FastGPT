import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { runAgentLoop } from '../llm/agentLoop/interface';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AuxiliaryGenerationStreamWriter } from './stream';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { createChatCompletionDeltaResponse } from '@fastgpt/global/core/ai/llm/utils';

type RunAuxiliaryGenerationAgentLoopParams = {
  teamId: string;
  model: string;
  systemPrompt: string;
  messages: ChatCompletionMessageParam[];
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  streamWriter?: AuxiliaryGenerationStreamWriter;
  checkIsStopping?: () => boolean;
  usageSink?: (usages: ChatNodeUsageType[]) => void;
};

/**
 * 运行辅助生成的无工具 Agent Loop。
 *
 * 该入口只封装统一 agent loop 的模型循环和计划维护，不注册 runtime tools，
 * 因此不会隐式获得 workflow、Skill 或虚拟机执行能力。
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
  usageSink
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
        plan: { enabled: true }
      },
      toolCatalog: {
        runtimeTools: []
      },
      executeTool: async () => {
        throw new Error('Auxiliary generation does not support runtime tools');
      },
      checkIsStopping,
      emitEvent: (event) => {
        if (event.type === 'reasoning_delta') {
          streamWriter?.({
            event: AuxiliaryGenerationEventEnum.answer,
            data: createChatCompletionDeltaResponse({ reasoningContent: event.text })
          });
        }
      },
      usagePush: usageSink
    },
    input: {
      systemPrompt,
      messages
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
    status: result.status,
    answerText,
    reasoningText
  };
}
