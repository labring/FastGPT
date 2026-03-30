import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import {
  getInitialPlanPrompt,
  getContinuePlanPrompt,
  getInitialPlanQuery,
  reTryPlanPrompt
} from './prompt';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { parseJsonArgs } from '../../../../../../ai/utils';
import { AIAskAnswerSchema, AIAskTool } from './ask/constants';
import { AgentPlanSchema, type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { GetSubAppInfoFnType } from '../../type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '../../../../../../../../web/i18n/utils';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import type { PlanAgentParamsType } from './constants';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';

const agentLogger = getLogger(LogCategories.MODULE.AI.AGENT);

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
    userKey?: OpenaiAccountType;
  } & (InitialParams | ContinueParams | InteractiveParams);

export type DispatchPlanAgentResponse = {
  askInteractive?: InteractiveNodeResponseType;
  plan?: AgentPlanType;
  planBuffer: PlanAgentParamsType;
  completeMessages: ChatCompletionMessageParam[];
  usages: ChatNodeUsageType[];
  nodeResponse: ChatHistoryItemResType;
};

const parsePlan = async ({
  text,
  planId,
  task,
  description,
  background
}: {
  text: string;
} & PlanAgentParamsType) => {
  if (!text) {
    return;
  }

  const result = parseJsonArgs<{ steps: AgentPlanType['steps'] }>(text);

  if (!result) {
    return result;
  }

  const params = await AgentPlanSchema.safeParseAsync({
    ...result,
    planId,
    task,
    description,
    background
  });

  if (!params.success) {
    agentLogger.warn(`[Plan Agent] Not plan`, { text });
    return;
  }

  return params.data;
};
const parseAskInteractive = async (
  toolCalls: ChatCompletionMessageToolCall[]
): Promise<InteractiveNodeResponseType | undefined> => {
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
    agentLogger.warn(`[Plan Agent] Ask tool params is not valid`, {
      tooCall
    });
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
  planId,
  task,
  description,
  background,
  userKey,
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
      agentLogger.error('Plan interactive mode error', {
        planMessages: props.planMessages
      });
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

  const requestParams = {
    model: modelData.model,
    stream: true,
    tools: props.mode === 'continue' ? undefined : [AIAskTool],
    tool_choice: 'auto' as const,
    toolCallMode: modelData.toolChoice ? ('toolChoice' as const) : ('prompt' as const),
    parallel_tool_calls: false
  };
  let {
    answerText,
    toolCalls = [],
    usage,
    completeMessages,
    responseEmptyTip,
    requestId
  } = await createLLMResponse({
    isAborted: checkIsStopping,
    userKey,
    body: {
      messages: requestMessages,
      ...requestParams
    }
  });

  if (responseEmptyTip) {
    return Promise.reject(responseEmptyTip);
  }

  const llmRequestIds: string[] = [requestId];
  let totalPoints = 0; // 每次 LLM 调用单独计价后累加，避免梯度计费错误

  // 初始调用的价格计算
  const initialPoints = userKey
    ? 0
    : formatModelChars2Points({
        model: modelData.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }).totalPoints;
  totalPoints += initialPoints;

  /*
    正常输出情况：
    1. text: 正常生成plan
    2. toolCall: 调用ask工具
    3. text + confirm: 成功生成工具 + 确认操作
  */
  // 1. 首次获取交互结果
  const { askInteractive, plan } = await (async () => {
    // 1. 首次获取交互结果
    let [askInteractive, plan] = await Promise.all([
      parseAskInteractive(toolCalls),
      parsePlan({
        text: answerText,
        planId,
        task,
        description,
        background
      })
    ]);
    if (plan || askInteractive) {
      return {
        askInteractive,
        plan
      };
    }

    // 2. 二次尝试生成 plan
    agentLogger.warn('[Plan Agent] parse failed, try regenerate plan once', {
      requestId,
      mode: props.mode,
      answerText: answerText.slice(0, 2000)
    });

    const regenerateResponse = await createLLMResponse({
      isAborted: checkIsStopping,
      userKey,
      body: {
        messages: [
          ...completeMessages,
          {
            role: 'user',
            content: reTryPlanPrompt
          }
        ],
        ...requestParams
      }
    });
    completeMessages = regenerateResponse.completeMessages;

    // 再生成的价格计算（单独计价）
    const regenPoints = userKey
      ? 0
      : formatModelChars2Points({
          model: modelData.model,
          inputTokens: regenerateResponse.usage.inputTokens,
          outputTokens: regenerateResponse.usage.outputTokens
        }).totalPoints;
    totalPoints += regenPoints;
    // 累加 tokens 仅用于展示
    usage.inputTokens += regenerateResponse.usage.inputTokens;
    usage.outputTokens += regenerateResponse.usage.outputTokens;
    llmRequestIds.push(regenerateResponse.requestId);

    [askInteractive, plan] = await Promise.all([
      parseAskInteractive(regenerateResponse.toolCalls || []),
      parsePlan({
        text: regenerateResponse.answerText,
        planId,
        task,
        description,
        background
      })
    ]);
    if (plan || askInteractive) {
      return {
        askInteractive,
        plan
      };
    }

    // 真的失败了
    agentLogger.warn('[Plan Agent] plan regenerate failed', {
      requestId,
      regenerateRequestId: regenerateResponse.requestId,
      mode: props.mode,
      answerText: regenerateResponse.answerText.slice(0, 2000)
    });
    askInteractive = {
      type: 'agentPlanAskQuery',
      params: {
        content: i18nT('chat:agent_plan_parse_retry_tip')
      }
    };

    return {
      askInteractive
    };
  })();

  // 使用累加的价格（每次调用单独计价后累加），保证梯度计费正确
  const modelName = modelData.name;

  const nodeId = getNanoid(6);
  const nodeResponse: ChatHistoryItemResType = {
    nodeId: nodeId,
    id: nodeId,
    moduleType: FlowNodeTypeEnum.emptyNode,
    moduleName:
      props.mode === 'continue' ? i18nT('chat:reflection_agent') : i18nT('chat:plan_agent'),
    moduleLogo: 'core/app/agent/child/plan',
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalPoints,
    model: modelName,
    runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
    llmRequestIds
  };

  return {
    askInteractive,
    plan,
    planBuffer: {
      planId,
      task,
      description,
      background
    },
    completeMessages,
    nodeResponse,
    usages: [
      {
        moduleName: i18nT('account_usage:agent_call'),
        model: modelName,
        totalPoints,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ]
  };
};
