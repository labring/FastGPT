import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type.d';
import { createLLMResponse, type ResponseEvents } from '../../../../../../ai/llm/request';
import { getPlanAgentPrompt, type PlanType } from './prompt';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { SubAppIds } from '../constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

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
      tool_choice: 'none',
      toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
      parallel_tool_calls: true
    },
    onStreaming
  });

  const planObj = JSON.parse(answerText) as PlanType;
  planObj.steps = planObj.steps.map((step) => ({
    ...step,
    id: getNanoid(6)
  }));
  const finalAnswer = JSON.stringify(planObj, null, 2);

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  return {
    response: finalAnswer,
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
