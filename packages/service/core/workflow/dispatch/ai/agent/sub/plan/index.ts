import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import { getInitialPlanPrompt, getContinuePlanPrompt, getInitialPlanQuery } from './prompt';
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
import {
  AgentPlanSchema,
  AgentStepItemSchema,
  type AgentPlanType
} from '@fastgpt/global/core/ai/agent/type';
import type { GetSubAppInfoFnType } from '../../type';
import { parseSystemPrompt } from '../../utils';
import { addLog } from '../../../../../../../common/system/log';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '../../../../../../../../web/i18n/utils';
import { SubAppIds } from '../constants';
import type { PlanAgentParamsType } from './constants';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

type PlanAgentConfig = {
  systemPrompt?: string;
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type InitialParams = {
  mode: 'initial';
};
// 肯定是从 initial 进入的，所以上下文继承 InitialParams
type InteractiveParams = {
  mode: 'interactive';
  interactive: WorkflowInteractiveResponseType;
  planMessages: ChatCompletionMessageParam[];
  queryInput: string;
};
// 只需要一个 query，里面包含了任务目标和步骤执行结果
type ContinueParams = {
  mode: 'continue';
  query: string;
};

type DispatchPlanAgentProps = PlanAgentConfig &
  PlanAgentParamsType & {
    checkIsStopping: () => boolean;
    completionTools: ChatCompletionTool[];
    getSubAppInfo: GetSubAppInfoFnType;
  } & (InitialParams | ContinueParams | InteractiveParams);

export type DispatchPlanAgentResponse = {
  askInteractive?: UserInputInteractive | AgentPlanAskQueryInteractive;
  plan?: AgentPlanType;
  planBuffer: PlanAgentParamsType;
  completeMessages: ChatCompletionMessageParam[];
  usages: ChatNodeUsageType[];
  nodeResponse: ChatHistoryItemResType;
};

const parsePlan = async ({
  text,
  task,
  description,
  background
}: {
  text: string;
} & PlanAgentParamsType) => {
  if (!text) {
    return;
  }

  const result = parseJsonArgs(text);
  if (!result) {
    return;
  }

  const params = await AgentPlanSchema.safeParseAsync({
    ...result,
    task,
    description,
    background
  });
  if (!params.success) {
    addLog.warn(`[Plan Agent] Not plan`, { text });
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
                key: item.label,
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

/* 
  调用场景
  1. 首轮调用 plan：history + query
  2. 首轮 plan + 交互： 直接拼接
  3. 第二次调用 plan: history + query + response + new query
  4. 第二次 plan + 交互：直接拼接
*/
export const dispatchPlanAgent = async ({
  checkIsStopping,
  completionTools,
  getSubAppInfo,
  systemPrompt,
  model,
  task,
  description,
  background,
  ...props
}: DispatchPlanAgentProps): Promise<DispatchPlanAgentResponse> => {
  const startTime = Date.now();
  const modelData = getLLMModel(model);

  // 移除 plan 工具
  completionTools = completionTools.filter((item) => item.function.name !== SubAppIds.plan);

  // 根据 mode 选择对应的提示词
  const planPrompt = (() => {
    if (props.mode === 'initial' || props.mode === 'interactive') {
      return getInitialPlanPrompt({ getSubAppInfo, completionTools });
    } else {
      return getContinuePlanPrompt({ getSubAppInfo, completionTools });
    }
  })();

  const requestMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: [planPrompt, systemPrompt ? systemPrompt : undefined].filter(Boolean).join('\n\n')
    }
  ];

  // 分类：query/user select/user form

  // 上一轮是 Ask 模式，进行工具调用拼接
  if (props.mode === 'interactive') {
    const lastMessages = props.planMessages[props.planMessages.length - 1];

    if (lastMessages.role === 'assistant' && lastMessages.tool_calls) {
      requestMessages.push(...props.planMessages);
      requestMessages.push({
        role: 'tool',
        tool_call_id: lastMessages.tool_calls[0].id,
        content: props.queryInput
      });
    } else {
      addLog.error('Plan interactive mode error', { planMessages: props.planMessages });
      return Promise.reject('Plan interactive mode error');
    }
  } else if (props.mode === 'initial') {
    requestMessages.push({
      role: 'user',
      content: getInitialPlanQuery({
        task,
        description,
        background
      })
    });
  } else if (props.mode === 'continue') {
    requestMessages.push({
      role: 'user',
      content: props.query
    });
  }
  // console.log('Plan request messages');
  // console.dir({ requestMessages }, { depth: null });
  // console.log('userInput:', userInput, 'mode:', mode, 'interactive?.type:', interactive?.type);

  let {
    answerText,
    toolCalls = [],
    usage,
    completeMessages,
    responseEmptyTip
  } = await createLLMResponse({
    isAborted: checkIsStopping,
    body: {
      model: modelData.model,
      messages: requestMessages,
      stream: true,
      tools: props.mode === 'continue' ? undefined : [AIAskTool],
      tool_choice: 'auto',
      toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
      parallel_tool_calls: false
    }
  });

  if (responseEmptyTip) {
    return Promise.reject(responseEmptyTip);
  }

  /* 
    正常输出情况：
    1. text: 正常生成plan
    2. toolCall: 调用ask工具
    3. text + confirm: 成功生成工具 + 确认操作
  */
  // 获取生成的 plan
  const plan = await parsePlan({
    text: answerText,
    task,
    description,
    background
  });
  // 获取交互结果
  const askInteractive = await parseAskInteractive(toolCalls);

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

  const nodeResponse: ChatHistoryItemResType = {
    nodeId: getNanoid(),
    id: getNanoid(),
    moduleType: FlowNodeTypeEnum.emptyNode,
    moduleName: i18nT('chat:plan_agent'),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalPoints,
    model: modelName,
    runningTime: +((Date.now() - startTime) / 1000).toFixed(2)
  };

  return {
    askInteractive,
    plan,
    planBuffer: {
      task,
      description,
      background
    },
    completeMessages,
    nodeResponse,
    usages: [
      {
        moduleName: i18nT('chat:plan_agent'),
        model: modelName,
        totalPoints,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ]
  };
};
