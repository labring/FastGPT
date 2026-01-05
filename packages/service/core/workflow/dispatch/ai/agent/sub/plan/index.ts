import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
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
  AgentPlanAskQueryInteractive,
  UserInputInteractive,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { parseJsonArgs } from '../../../../../../ai/utils';
import { AIAskAnswerSchema, AIAskTool } from './ask/constants';
import { AgentPlanSchema, type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { GetSubAppInfoFnType } from '../../type';
import { getStepDependon } from '../../master/dependon';
import { parseSystemPrompt } from '../../utils';
import { addLog } from '../../../../../../../common/system/log';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

type PlanAgentConfig = {
  systemPrompt?: string;
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type DispatchPlanAgentProps = PlanAgentConfig & {
  checkIsStopping: () => boolean;

  historyMessages: ChatCompletionMessageParam[];
  interactive?: WorkflowInteractiveResponseType;
  userInput: string;
  background?: string;
  referencePlans?: string;

  completionTools: ChatCompletionTool[];
  getSubAppInfo: GetSubAppInfoFnType;
};

export type DispatchPlanAgentResponse = {
  askInteractive?: UserInputInteractive | AgentPlanAskQueryInteractive;
  plan?: AgentPlanType;
  completeMessages: ChatCompletionMessageParam[];
  usages: ChatNodeUsageType[];
};

const parsePlan = async (text: string) => {
  if (!text) {
    return;
  }

  const params = await AgentPlanSchema.safeParseAsync(parseJsonArgs(text));
  if (!params.success) {
    addLog.warn(`[Plan Agent] Plan response is not valid`, { text });
    return;
  }

  return params.data;
};
const parseAskInteractive = async (
  toolCalls: ChatCompletionMessageToolCall[]
): Promise<UserInputInteractive | AgentPlanAskQueryInteractive | undefined> => {
  const tooCall = toolCalls[0];
  if (!tooCall) return;
  const params = await AIAskAnswerSchema.safeParseAsync(parseJsonArgs(tooCall.function.arguments));
  if (params.success) {
    const data = params.data;

    if (data.form && data.form.length > 0) {
      return {
        type: 'agentPlanAskUserForm',
        params: {
          description: data.question,
          inputForm:
            data.form?.map((item) => {
              return {
                type: item.type as FlowNodeInputTypeEnum,
                key: getNanoid(6),
                label: item.label,
                value: '',
                required: false,
                valueType:
                  item.type === FlowNodeInputTypeEnum.numberInput
                    ? WorkflowIOValueTypeEnum.number
                    : WorkflowIOValueTypeEnum.string,
                list:
                  'options' in item
                    ? item.options?.map((option) => ({ label: option, value: option }))
                    : undefined
              };
            }) || []
        }
      };
    }
    return {
      type: 'agentPlanAskQuery',
      params: {
        content: data.question
      }
    };
  } else {
    addLog.warn(`[Plan Agent] Ask tool params is not valid`, { tooCall });
    return;
  }
};

export const dispatchPlanAgent = async ({
  checkIsStopping,
  historyMessages,
  userInput,
  interactive,
  completionTools,
  getSubAppInfo,
  systemPrompt,
  model
}: DispatchPlanAgentProps): Promise<DispatchPlanAgentResponse> => {
  const modelData = getLLMModel(model);

  const parsedSystemPrompt = parseSystemPrompt({ systemPrompt, getSubAppInfo });

  const requestMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: [
        getPlanAgentSystemPrompt({
          getSubAppInfo,
          completionTools
        }),
        parsedSystemPrompt
          ? `<user_background>
          ${parsedSystemPrompt}
          
          请按照用户提供的背景信息来重新生成计划，优先遵循用户的步骤安排和偏好。
          
          **重要**：如果背景信息中包含工具引用（@工具名），请优先使用这些工具。当有多个同类工具可选时（如多个搜索工具），优先选择背景信息中已使用的工具，避免功能重叠。
          </user_background>`
          : ''
      ]
        .filter(Boolean)
        .join('\n\n')
    },
    ...historyMessages
  ];

  // 分类：query/user select/user form
  const lastMessages = requestMessages[requestMessages.length - 1];
  // 上一轮是 Ask 模式，进行工具调用拼接
  if (
    (interactive?.type === 'agentPlanAskUserForm' ||
      interactive?.type === 'agentPlanAskUserSelect' ||
      interactive?.type === 'agentPlanAskQuery') &&
    lastMessages.role === 'assistant' &&
    lastMessages.tool_calls
  ) {
    requestMessages.push({
      role: 'tool',
      tool_call_id: lastMessages.tool_calls[0].id,
      content: userInput
    });
    // requestMessages.push({
    //   role: 'assistant',
    //   content: '请基于以上收集的用户信息，重新生成完整的计划，严格按照 JSON Schema 输出。'
    // });
  } else {
    requestMessages.push({
      role: 'user',
      content: userInput
    });
  }

  console.log('Plan request messages');
  console.dir({ requestMessages }, { depth: null });
  let {
    answerText,
    toolCalls = [],
    usage,
    getEmptyResponseTip,
    completeMessages
  } = await createLLMResponse({
    isAborted: checkIsStopping,
    body: {
      model: modelData.model,
      messages: requestMessages,
      stream: true,
      tools: [AIAskTool],
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
    3. text + confirm: 成功生成工具 + 确认操作
  */
  // 获取生成的 plan
  const plan = await parsePlan(answerText);
  // 获取交互结果
  const askInteractive = await parseAskInteractive(toolCalls);

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  return {
    askInteractive,
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
    ]
  };
};

export const dispatchReplanAgent = async ({
  checkIsStopping,
  historyMessages,
  interactive,
  completionTools,
  getSubAppInfo,
  userInput,
  plan,
  background,
  systemPrompt,

  model,
  temperature,
  top_p,
  stream
}: DispatchPlanAgentProps & {
  plan: AgentPlanType;
}): Promise<DispatchPlanAgentResponse> => {
  const usages: ChatNodeUsageType[] = [];
  const modelData = getLLMModel(model);

  // 解析 systemPrompt（如果存在）
  const parsedSystemPrompt = parseSystemPrompt({ systemPrompt, getSubAppInfo });

  const requestMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: [
        getReplanAgentSystemPrompt({
          getSubAppInfo,
          completionTools
        }),
        parsedSystemPrompt
          ? `<user_background>
            ${parsedSystemPrompt}
            
            如果用户提供了前置规划，请按照用户的步骤安排和偏好来重新生成计划，优先遵循用户的步骤安排和偏好。如果「用户前置规划」中包含工具引用（@工具名），请优先使用这些工具，避免功能重叠。
            </user_background>`
          : ''
      ]
        .filter(Boolean)
        .join('\n\n')
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
    requestMessages.push({
      role: 'assistant',
      content: '请基于以上收集的用户信息，对 PLAN 进行重新规划，并严格按照 JSON Schema 输出。'
    });
  } else {
    // 获取依赖的步骤
    const { depends, usage: dependsUsage } = await getStepDependon({
      checkIsStopping,
      model,
      steps: plan.steps,
      step: {
        id: '',
        title: '重新规划决策依据：需要依赖哪些步骤的判断',
        description: '本步骤分析先前的执行结果，以确定重新规划时需要依赖哪些特定步骤。'
      }
    });

    if (dependsUsage) {
      usages.push(dependsUsage);
    }
    const replanSteps = plan.steps.filter((step) => depends.includes(step.id));

    requestMessages.push({
      role: 'user',
      content: getReplanAgentUserPrompt({
        task: userInput,
        dependsSteps: replanSteps,
        background
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
    isAborted: checkIsStopping,
    body: {
      model: modelData.model,
      temperature,
      messages: requestMessages,
      top_p,
      stream: true,
      tools: [AIAskTool],
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
  const rePlan = await parsePlan(answerText);
  const askInteractive = await parseAskInteractive(toolCalls);

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });
  usages.push({
    moduleName: '重新规划',
    model: modelName,
    totalPoints,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  return {
    askInteractive,
    plan: rePlan,
    completeMessages,
    usages
  };
};
