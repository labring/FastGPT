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
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { parseToolArgs } from '../../../utils';
import { AskAgentTool, type AskAgentToolParamsType } from './ask/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';

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
  onReasoning: ResponseEvents['onReasoning'];
  onStreaming: ResponseEvents['onStreaming'];
};

type DispatchPlanAgentResponse = {
  response: string;
  usages: ChatNodeUsageType[];
  completeMessages: ChatCompletionMessageParam[];
  toolMessages?: ChatCompletionMessageParam[];
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

  // TODO: 考虑一下 plan 要不要挂上 master 的工具组
  // const filterPlanTools = subApps.filter((item) => item.function.name !== SubAppIds.plan);
  // filterPlanTools.push(AskAgentTool);
  const tools = [AskAgentTool];

  const {
    reasoningText,
    answerText,
    toolCalls = [],
    usage,
    getEmptyResponseTip,
    completeMessages
  } = await createLLMResponse({
    body: {
      model: modelData.model,
      temperature,
      messages: requestMessages,
      top_p,
      stream,

      tools,
      tool_choice: 'auto',
      toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
      parallel_tool_calls: true
    },
    onReasoning,
    onStreaming
  });

  if (!answerText && !reasoningText && !toolCalls.length) {
    return Promise.reject(getEmptyResponseTip());
  }

  // TODO: 需要考虑多个 Interactive 并发的情况
  let interactiveResponse: InteractiveNodeResponseType = {
    type: 'agentPlanCheck',
    params: {}
  };

  for await (const call of toolCalls) {
    const toolId = call.function.name;

    if (toolId === SubAppIds.ask) {
      const params = parseToolArgs<AskAgentToolParamsType>(call.function.arguments);

      if (params.mode === 'select') {
        interactiveResponse = {
          type: 'agentPlanAskUserSelect',
          params: {
            description: params?.prompt ?? '选择选项',
            userSelectOptions: params?.options?.map((v, i) => {
              return { key: `option${i}`, value: v };
            })
          }
        } as InteractiveNodeResponseType;
      }
      if (params.mode === 'input') {
        interactiveResponse = {
          type: 'agentPlanAskQuery',
          params: {
            content: params?.prompt ?? '输入详细信息'
          }
        };
      }

      completeMessages.push({
        tool_call_id: call.id,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        content: '等待用户输入内容'
      });
    }
  }

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  const toolMessages: ChatCompletionMessageParam[] = [];
  if (answerText) {
    const toolId = getNanoid(6);
    const toolCall: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      tool_calls: [
        {
          id: toolId,
          type: 'function',
          function: {
            name: SubAppIds.plan,
            arguments: ''
          }
        }
      ]
    };
    const toolCallResponse: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Tool,
      tool_call_id: toolId,
      content: answerText
    };
    toolMessages.push(toolCall, toolCallResponse);
  }

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
    ],
    completeMessages,
    toolMessages,
    interactiveResponse
  };
};
