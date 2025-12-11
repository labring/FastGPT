import type { ChatCompletionMessageParam, ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import {
  getPlanAgentSystemPrompt,
  getReplanAgentSystemPrompt,
  getReplanAgentUserPrompt,
  getUserContent
} from './prompt';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { parseJsonArgs } from '../../../../../../ai/utils';
import { PlanAgentAskTool, type AskAgentToolParamsType } from './ask/constants';
import { PlanCheckInteractive } from './constants';
import type { AgentPlanType } from './type';
import type { GetSubAppInfoFnType } from '../../type';
import { getStepDependon } from '../../master/dependon';
import { parseSystemPrompt } from '../../utils';

type PlanAgentConfig = {
  systemPrompt?: string;
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
  answerText?: string;
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
  systemPrompt,
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
  console.log('user input:', userInput);

  // 上一轮是 Ask 模式，进行工具调用拼接
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
    // TODO: 是否合理，以及模型兼容性问题
    requestMessages.push({
      role: 'assistant',
      content: '请基于以上收集的用户信息，重新生成完整的计划，严格按照 JSON Schema 输出。'
    });
  } else {
    // TODO: 这里拼接的话，对于多轮对话不是很友好。
    requestMessages.push({
      role: 'user',
      content: getUserContent({ userInput, systemPrompt, getSubAppInfo })
    });
  }

  console.log('Plan request messages');
  console.dir(
    { requestMessages, tools: isTopPlanAgent ? [PlanAgentAskTool] : [] },
    { depth: null }
  );
  let {
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

  // 获取生成的 plan
  const plan = (() => {
    if (!answerText) {
      return;
    }

    const params = parseJsonArgs<AgentPlanType>(answerText);
    if (toolCalls.length === 0 && (!params || !params.task || !params.steps)) {
      throw new Error('Plan response is not valid');
    }
    return params;
  })();
  if (plan) {
    answerText = '';
  }

  // 只有顶层有交互模式
  const interactiveResponse: InteractiveNodeResponseType | undefined = (() => {
    if (!isTopPlanAgent) return;

    const tooCall = toolCalls[0];
    if (tooCall) {
      const params = parseJsonArgs<AskAgentToolParamsType>(tooCall.function.arguments);
      if (params) {
        return {
          type: 'agentPlanAskQuery',
          params: {
            content: params.questions.join('\n')
          }
        };
      } else {
        console.log(JSON.stringify({ answerText, toolCalls }, null, 2), 'Plan response');
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
    answerText: answerText || '',
    plan,
    completeMessages,
    usages: [
      {
        moduleName: '任务规划',
        model: modelName,
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
  systemPrompt,

  model,
  temperature,
  top_p,
  stream,
  isTopPlanAgent
}: DispatchPlanAgentProps & {
  plan: AgentPlanType;
}): Promise<DispatchPlanAgentResponse> => {
  const modelData = getLLMModel(model);

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
    // TODO: 确认这里是否有问题
    requestMessages.push({
      role: 'assistant',
      content: '请基于以上收集的用户信息，对 PLAN 进行重新规划，并严格按照 JSON Schema 输出。'
    });
  } else {
    // 获取依赖的步骤
    const { depends, usage: dependsUsage } = await getStepDependon({
      model,
      steps: plan.steps,
      step: {
        id: '',
        title: '重新规划决策依据：需要依赖哪些步骤的判断',
        description: '本步骤分析先前的执行结果，以确定重新规划时需要依赖哪些特定步骤。'
      }
    });
    // TODO: 推送
    const replanSteps = plan.steps.filter((step) => depends.includes(step.id));

    requestMessages.push({
      role: 'user',
      // 根据需要 replanSteps 生成用户输入
      content: getReplanAgentUserPrompt({
        task: userInput,
        dependsSteps: replanSteps,
        background,
        systemPrompt: parseSystemPrompt({ systemPrompt, getSubAppInfo })
      })
    });
  }

  console.log('Replan call messages', JSON.stringify(requestMessages, null, 2));
  let {
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
  const rePlan = (() => {
    if (!answerText) {
      return;
    }

    const params = parseJsonArgs<AgentPlanType>(answerText);
    if (toolCalls.length === 0 && (!params || !params.steps)) {
      throw new Error('Replan response is not valid');
    }
    return params;
  })();
  if (rePlan) {
    answerText = '';
  }

  // 只有顶层有交互模式
  const interactiveResponse: InteractiveNodeResponseType | undefined = (() => {
    if (!isTopPlanAgent) return;

    const tooCall = toolCalls[0];
    if (tooCall) {
      const params = parseJsonArgs<AskAgentToolParamsType>(tooCall.function.arguments);
      if (params) {
        return {
          type: 'agentPlanAskQuery',
          params: {
            content: params.questions.join('\n')
          }
        };
      } else {
        console.log(JSON.stringify({ answerText, toolCalls }, null, 2), 'Replan response');
        return {
          type: 'agentPlanAskQuery',
          params: {
            content: '生成的 ask 结构异常'
          }
        };
      }
    }

    // RePlan 没有主动交互，则强制触发 check
    return PlanCheckInteractive;
  })();

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  return {
    answerText,
    plan: rePlan,
    completeMessages,
    usages: [
      {
        moduleName: '重新规划',
        model: modelName,
        totalPoints,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ],
    interactiveResponse
  };
};
