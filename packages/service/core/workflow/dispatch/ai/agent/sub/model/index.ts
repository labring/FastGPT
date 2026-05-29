import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { createLLMResponse, type ResponseEvents } from '../../../../../../ai/llm/request';
import { getLLMModelById } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

type ModelAgentConfig = {
  modelId: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type DispatchModelAgentProps = ModelAgentConfig & {
  systemPrompt: string;
  task: string;
  onReasoning: ResponseEvents['onReasoning'];
  onStreaming: ResponseEvents['onStreaming'];
};

type DispatchPlanAgentResponse = {
  response: string;
  usages: ChatNodeUsageType[];
};

export async function dispatchModelAgent({
  modelId,
  temperature,
  top_p,
  stream,
  systemPrompt,
  task,
  onReasoning,
  onStreaming
}: DispatchModelAgentProps): Promise<DispatchPlanAgentResponse> {
  const modelData = getLLMModelById(modelId);

  const messages: ChatCompletionMessageParam[] = [
    ...(systemPrompt
      ? [
          {
            role: 'system' as const,
            content: systemPrompt
          }
        ]
      : []),
    {
      role: 'user',
      content: task
    }
  ];

  const { answerText, usage } = await createLLMResponse({
    body: {
      modelId: modelData.id,
      temperature,
      messages: messages,
      top_p,
      stream
    },
    onReasoning,
    onStreaming
  });

  const { totalPoints, modelName } = formatModelChars2Points({
    modelId: modelData.id,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  return {
    response: answerText,
    usages: [
      {
        moduleName: modelName,
        modelId: modelData.id,
        totalPoints,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ]
  };
}
