import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type.d';
import { createLLMResponse, type ResponseEvents } from '../../../../../../ai/llm/request';
import { getPlanAgentPrompt } from './prompt';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { SubAppIds } from '../constants';

type PlanAgentConfig = {
  model: string;
  customSystemPrompt?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type DispatchPlanAgentProps = PlanAgentConfig & {
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
  onReasoning: ResponseEvents['onReasoning'];
  onStreaming: ResponseEvents['onStreaming'];
};

type DispatchPlanAgentResponse = {
  response: string;
  usages: ChatNodeUsageType[];
};

export const dispatchPlanAgent = async ({
  messages,
  tools,
  model,
  customSystemPrompt,
  temperature,
  top_p,
  stream,
  onReasoning,
  onStreaming
}: DispatchPlanAgentProps): Promise<DispatchPlanAgentResponse> => {
  const modelData = getLLMModel(model);

  const requestMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: getPlanAgentPrompt(customSystemPrompt)
    },
    ...messages.filter((item) => item.role !== 'system'),
    { role: 'user', content: 'Start plan' }
  ];
  const filterPlanTools = tools.filter((item) => item.function.name !== SubAppIds.plan);

  const { answerText, usage } = await createLLMResponse({
    body: {
      model: modelData.model,
      temperature,
      messages: requestMessages,
      top_p,
      stream,

      tools: filterPlanTools,
      tool_choice: 'auto',
      toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
      parallel_tool_calls: true
    },
    onReasoning,
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
};
