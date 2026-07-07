import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { runUnifiedAgentLoop, createUpdatePlanTool } from '../llm/agentLoop';
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
  const result = await runUnifiedAgentLoop({
    runtime: {
      teamId,
      model,
      stream: true,
      useVision,
      useAudio,
      useVideo,
      toolCatalog: {
        runtimeTools: [],
        updatePlanTool: createUpdatePlanTool()
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
      usageSink
    },
    input: {
      systemPrompt,
      messages
    }
  });

  return {
    status: result.status,
    answerText: result.answerText ?? '',
    reasoningText: result.reasoningText
  };
}
