import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { createLLMResponse, type ResponseEvents } from '../../../../../../ai/llm/request';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

type ModelAgentConfig = {
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type DispatchModelAgentProps = ModelAgentConfig & {
  systemPrompt: string;
  task: string;
  onStreaming: ResponseEvents['onStreaming'];
};

type DispatchPlanAgentResponse = {
  response: string;
  usages: ChatNodeUsageType[];
};

export async function dispatchModelAgent({
  model,
  temperature,
  top_p,
  stream,
  systemPrompt,
  task,
  onStreaming
}: DispatchModelAgentProps): Promise<DispatchPlanAgentResponse> {
  const modelData = getLLMModel(model);

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
      model: modelData.model,
      temperature,
      messages: messages,
      top_p,
      stream
    },
    onStreaming
  });

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  return {
    response: answerText,
    usages: [
      {
        moduleName: modelName,
        model: modelData.model,
        totalPoints,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ]
  };
}
