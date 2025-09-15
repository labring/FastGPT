import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type.d';
import { type ResponseEvents } from '../../../../../../ai/llm/request';
import { getPlanAgentPrompt } from './prompt';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { SubAppIds } from '../constants';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { runAgentCall } from '../../../../../../../core/ai/llm/agentCall';
import { parseToolArgs } from '../../../utils';
import { AskAgentTool, type AskAgentToolParamsType } from '../ask/constants';

type PlanAgentConfig = {
  model: string;
  systemPrompt?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type DispatchPlanAgentProps = PlanAgentConfig & {
  messages: ChatCompletionMessageParam[];
  subApps: ChatCompletionTool[];
  getToolInfo: (id: string) => { name: string; avatar: string };
  onReasoning: ResponseEvents['onReasoning'];
  onStreaming: ResponseEvents['onStreaming'];
};

type DispatchPlanAgentResponse = {
  response: string;
  usages: ChatNodeUsageType[];
  assistantResponses: AIChatItemValueItemType[];
  interactiveResponse?: InteractiveNodeResponseType;
};

export const dispatchPlanAgent = async ({
  messages,

  subApps,
  model,
  systemPrompt,
  temperature,
  top_p,
  stream,
  getToolInfo,
  onReasoning,
  onStreaming
}: DispatchPlanAgentProps): Promise<DispatchPlanAgentResponse> => {
  const modelData = getLLMModel(model);

  const requestMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: getPlanAgentPrompt(systemPrompt)
    },
    ...messages.filter((item) => item.role !== 'system')
  ];
  const filterPlanTools = subApps.filter((item) => item.function.name !== SubAppIds.plan);
  filterPlanTools.push(AskAgentTool);

  const { assistantResponses, inputTokens, outputTokens, interactiveResponse } = await runAgentCall(
    {
      maxRunAgentTimes: 10,
      body: {
        model: modelData,
        messages: requestMessages,
        temperature,
        top_p,
        stream,
        subApps: filterPlanTools
      },
      getToolInfo,
      onReasoning,
      onStreaming,
      handleToolResponse: async ({ call }) => {
        const toolId = call.function.name;

        if (toolId === SubAppIds.ask) {
          const params = parseToolArgs<AskAgentToolParamsType>(call.function.arguments);

          if (params.mode === 'select') {
            return {
              response: '',
              usages: [],
              isEnd: false,
              interactive: {
                type: 'agentPlanAskUserSelect',
                params: {
                  description: params?.prompt ?? '选择选项',
                  userSelectOptions: params?.options?.map((v, i) => {
                    return { key: `option${i}`, value: v };
                  })
                }
              } as InteractiveNodeResponseType
            };
          }
          if (params.mode === 'input') {
            return {
              response: '',
              usages: [],
              isEnd: false,
              interactive: {
                type: 'agentPlanAskQuery',
                params: {
                  content: params?.prompt ?? '输入详细信息'
                }
              }
            };
          }

          return { response: 'invalid interactive mode', usages: [], isEnd: false };
        }

        return { response: 'invalid tool call', usages: [], isEnd: false };
      }
    }
  );

  const responseText = assistantResponses
    .filter((item) => item.text?.content)
    .map((item) => item.text?.content || '')
    .join('');

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens,
    outputTokens
  });

  return {
    response: responseText,
    usages: [
      {
        moduleName: modelName,
        model: modelData.model,
        totalPoints,
        inputTokens,
        outputTokens
      }
    ],
    assistantResponses,
    interactiveResponse
  };
};
