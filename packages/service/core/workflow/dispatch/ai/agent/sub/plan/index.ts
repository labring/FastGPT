import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type.d';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import {
  getPlanAgentSystemPrompt,
  getReplanAgentSystemPrompt,
  getReplanAgentUserPrompt
} from './prompt';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { parseToolArgs } from '../../../utils';
import { PlanAgentAskTool, type AskAgentToolParamsType } from './ask/constants';
import { PlanCheckInteractive } from './constants';
import type { AgentPlanType } from './type';
import type { GetSubAppInfoFnType } from '../../type';

type PlanAgentConfig = {
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type DispatchPlanAgentProps = PlanAgentConfig & {
  historyMessages: ChatCompletionMessageParam[];
  interactive?: WorkflowInteractiveResponseType;
  userInput: string;
  background?: string;
  referencePlans?: string;

  isTopPlanAgent: boolean;
  subAppList: ChatCompletionTool[];
  getSubAppInfo: GetSubAppInfoFnType;
};

type DispatchPlanAgentResponse = {
  plan?: AgentPlanType;
  completeMessages: ChatCompletionMessageParam[];
  usages: ChatNodeUsageType[];
  interactiveResponse?: InteractiveNodeResponseType;
};

export const dispatchPlanAgent = async ({
  historyMessages,
  userInput,
  interactive,
  subAppList,
  getSubAppInfo,
  model,
  temperature,
  top_p,
  stream,
  isTopPlanAgent
}: DispatchPlanAgentProps): Promise<DispatchPlanAgentResponse> => {
  const modelData = getLLMModel(model);

  const requestMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: getPlanAgentSystemPrompt({
        getSubAppInfo,
        subAppList
      })
    },
    ...historyMessages
  ];

  // 分类：query/user select/user form
  const lastMessages = requestMessages[requestMessages.length - 1];

  if (
    (interactive?.type === 'agentPlanAskUserSelect' || interactive?.type === 'agentPlanAskQuery') &&
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
  console.log(JSON.stringify({ answerText, toolCalls }, null, 2), 'Plan response');
  /* 
    正常输出情况：
    1. text: 正常生成plan
    2. toolCall: 调用ask工具
    3. text + toolCall: 可能生成 plan + 调用ask工具
  */

  // 获取生成的 plan
  const plan = (() => {
    if (!answerText) {
      throw new Error('Plan response is not valid');
    }

    const params = parseToolArgs<AgentPlanType>(answerText);
    if (!params || !params.task || !params.steps) {
      throw new Error('Plan response is not valid');
    }
    return params;
  })();

  // 只有顶层有交互模式
  const interactiveResponse: InteractiveNodeResponseType | undefined = (() => {
    if (!isTopPlanAgent) return;

    const tooCall = toolCalls[0];
    if (tooCall) {
      const params = parseToolArgs<AskAgentToolParamsType>(tooCall.function.arguments);
      if (params) {
        return {
          type: 'agentPlanAskQuery',
          params: {
            content: params.questions.join('\n')
          }
        };
      } else {
        return {
          type: 'agentPlanAskQuery',
          params: {
            content: '生成的 ask 结构异常'
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
    plan,
    completeMessages,
    usages: [
      {
        moduleName: modelName,
        model: modelData.model,
        totalPoints,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ],
    interactiveResponse
  };
};

export const dispatchReplanAgent = async ({
  historyMessages,
  interactive,
  subAppList,
  getSubAppInfo,
  userInput,
  plan,
  background,
  referencePlans,

  model,
  temperature,
  top_p,
  stream,
  isTopPlanAgent
}: DispatchPlanAgentProps & {
  plan: AgentPlanType;
}): Promise<DispatchPlanAgentResponse> => {
  const modelData = getLLMModel(model);
  const replanSteps = plan.steps.filter((step) => (plan.replan || []).includes(step.id));
  if (replanSteps.length === 0) {
    console.log(plan);
    return Promise.reject('No replan steps');
  }

  const requestMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: getReplanAgentSystemPrompt({
        getSubAppInfo,
        subAppList
      })
    },
    ...historyMessages
  ];

  // 分类：query/user select/user form
  const lastMessages = requestMessages[requestMessages.length - 1];

  if (
    (interactive?.type === 'agentPlanAskUserSelect' || interactive?.type === 'agentPlanAskQuery') &&
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
      content: getReplanAgentUserPrompt({
        task: plan.task,
        steps: replanSteps,
        background,
        referencePlans
      })
    });
  }

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
  console.log(JSON.stringify({ answerText, toolCalls }, null, 2), 'Replan response');
  /* 
    正常输出情况：
    1. text: 正常生成plan
    2. toolCall: 调用ask工具
    3. text + toolCall: 可能生成 plan + 调用ask工具
  */

  // 获取生成的 plan
  const rePlan = (() => {
    if (!answerText) {
      throw new Error('Replan response is not valid');
    }

    const params = parseToolArgs<AgentPlanType>(answerText);
    if (!params || !params.steps) {
      throw new Error('Replan response is not valid');
    }
    return params;
  })();

  // 只有顶层有交互模式
  const interactiveResponse: InteractiveNodeResponseType | undefined = (() => {
    if (!isTopPlanAgent) return;

    const tooCall = toolCalls[0];
    if (tooCall) {
      const params = parseToolArgs<AskAgentToolParamsType>(tooCall.function.arguments);
      if (params) {
        return {
          type: 'agentPlanAskQuery',
          params: {
            content: params.questions.join('\n')
          }
        };
      } else {
        return {
          type: 'agentPlanAskQuery',
          params: {
            content: '生成的 ask 结构异常'
          }
        };
      }
    }
  })();

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  return {
    plan: rePlan,
    completeMessages,
    usages: [
      {
        moduleName: modelName,
        model: modelData.model,
        totalPoints,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ],
    interactiveResponse
  };
};
