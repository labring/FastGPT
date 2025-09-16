import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import { getPlanAgentPrompt } from './prompt';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { SubAppIds } from '../constants';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { parseToolArgs } from '../../../utils';
import { PlanAgentAskTool, type AskAgentToolParamsType } from './ask/constants';
import { PlanCheckInteractive } from './constants';
import type { AgentPlanType } from './type';
import { getNanoid } from '@fastgpt/global/common/string/tools';

type PlanAgentConfig = {
  model: string;
  systemPrompt?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type DispatchPlanAgentProps = PlanAgentConfig & {
  historyMessages: ChatCompletionMessageParam[];
  userInput: string;
  interactive?: WorkflowInteractiveResponseType;

  subAppPrompt: string;
  isTopPlanAgent: boolean;
};

type DispatchPlanAgentResponse = {
  answerText: string;
  planList?: AgentPlanType;
  planToolCallMessages: ChatCompletionMessageParam[];
  completeMessages: ChatCompletionMessageParam[];
  usages: ChatNodeUsageType[];
  interactiveResponse?: InteractiveNodeResponseType;
};

export const dispatchPlanAgent = async ({
  historyMessages,
  userInput,
  interactive,
  subAppPrompt,
  model,
  systemPrompt,
  temperature,
  top_p,
  stream,
  isTopPlanAgent
}: DispatchPlanAgentProps): Promise<DispatchPlanAgentResponse> => {
  const modelData = getLLMModel(model);

  const requestMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: getPlanAgentPrompt(subAppPrompt, systemPrompt)
    },
    ...historyMessages.filter((item) => item.role !== 'system')
  ];

  // 分类：query/user select/user form
  const lastMessages = requestMessages[requestMessages.length - 1];
  if (
    (interactive?.type === 'agentPlanAskUserSelect' ||
      interactive?.type === 'agentPlanAskUserForm') &&
    lastMessages.role === 'assistant' &&
    lastMessages.tool_calls
  ) {
    requestMessages.push({
      role: 'tool',
      tool_call_id: lastMessages.tool_calls[0].id,
      content: userInput
    });
  } else {
    requestMessages.push({
      role: 'user',
      content: userInput
    });
  }
  // console.log(JSON.stringify({ requestMessages }, null, 2));

  const {
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

      tools: isTopPlanAgent ? [PlanAgentAskTool] : [],
      tool_choice: 'auto',
      toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
      parallel_tool_calls: false
    }
  });

  if (!answerText && !toolCalls.length) {
    return Promise.reject(getEmptyResponseTip());
  }

  /* 
    正常输出情况：
    1. text: 正常生成plan
    2. toolCall: 调用ask工具
    3. text + toolCall: 可能生成 plan + 调用ask工具
  */

  // Text: 回答的文本；planList: 结构化的plan，只能有其中一个有值
  const { text, planList } = (() => {
    if (!answerText)
      return {
        text: '',
        planList: undefined
      };
    const params = parseToolArgs<AgentPlanType>(answerText);
    if (!params || !params.task || !params.steps) {
      return {
        text: answerText,
        planList: undefined
      };
    }
    return {
      text: '',
      planList: params
    };
  })();
  const callPlanId = getNanoid(6);
  const planToolCallMessages: ChatCompletionMessageParam[] = [
    {
      role: 'assistant',
      tool_calls: [
        {
          id: callPlanId,
          type: 'function',
          function: {
            name: SubAppIds.plan,
            arguments: ''
          }
        }
      ]
    },
    {
      role: 'tool',
      tool_call_id: callPlanId,
      content: planList ? JSON.stringify(planList) : text || 'Create plan error'
    }
  ];

  // 只有顶层有交互模式
  const interactiveResponse: InteractiveNodeResponseType | undefined = (() => {
    if (!isTopPlanAgent) return;

    const tooCall = toolCalls[0];
    if (tooCall) {
      const params = parseToolArgs<AskAgentToolParamsType>(tooCall.function.arguments);
      if (params?.mode === 'select') {
        return {
          type: 'agentPlanAskUserSelect',
          params: {
            description: params.prompt ?? '',
            userSelectOptions: params.options.filter(Boolean).map((v, i) => {
              return { key: `option${i}`, value: v };
            })
          }
        };
      }
      if (params?.mode === 'input' && params.prompt) {
        return {
          type: 'agentPlanAskQuery',
          params: {
            content: params.prompt ?? ''
          }
        };
      }
    }

    // Plan 没有主动交互，则强制触发 check
    return PlanCheckInteractive;
  })();

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  return {
    answerText: text,
    planList,
    planToolCallMessages,
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
    interactiveResponse
  };
};
