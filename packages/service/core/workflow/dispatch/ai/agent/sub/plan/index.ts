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
import { AgentPlanSchema, type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { GetSubAppInfoFnType } from '../../type';
import { getNanoid, sliceJsonStr } from '@fastgpt/global/common/string/tools';
import { jsonrepair } from 'jsonrepair';
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

  const parsePlanData = async (value: unknown) => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const params = await AgentPlanSchema.safeParseAsync({
      ...value,
      task,
      description,
      background
    });

    if (!params.success) {
      return;
    }

    return params.data;
  };

  const directResult = parseJsonArgs(text);
  const directPlan = await parsePlanData(directResult);
  if (directPlan) {
    getLogger(LogCategories.MODULE.AI.AGENT).debug('[Plan Agent] JSON direct parsing successful');
    return directPlan;
  }

  try {
    const repairedText = jsonrepair(sliceJsonStr(text));
    const repairedResult = parseJsonArgs(repairedText);
    getLogger(LogCategories.MODULE.AI.AGENT).debug(
      '[Plan Agent] JSON jsonrepair parsing successful'
    );
    return parsePlanData(repairedResult);
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.AGENT).warn('[Plan Agent] local jsonrepair failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }
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
    getLogger(LogCategories.MODULE.AI.AGENT).warn(`[Plan Agent] Ask tool params is not valid`, {
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
      getLogger(LogCategories.MODULE.AI.AGENT).error('Plan interactive mode error', {
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

  let {
    answerText,
    toolCalls = [],
    usage,
    completeMessages,
    responseEmptyTip,
    requestId
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

  const llmRequestIds: string[] = [requestId];
  /* 
    正常输出情况：
    1. text: 正常生成plan
    2. toolCall: 调用ask工具
    3. text + confirm: 成功生成工具 + 确认操作
  */
  // 获取交互结果
  let askInteractive = await parseAskInteractive(toolCalls);
  let plan: AgentPlanType | undefined;

  if (!askInteractive) {
    plan = await parsePlan({
      text: answerText,
      task,
      description,
      background
    });
  }

  if (!askInteractive && !plan) {
    getLogger(LogCategories.MODULE.AI.AGENT).warn(
      '[Plan Agent] parse failed, try regenerate plan once',
      {
        requestId,
        mode: props.mode,
        answerText: answerText.slice(0, 2000)
      }
    );

    const regeneratePrompt = [
      '上一轮 plan 输出不是合法 JSON，无法解析。',
      '',
      '请基于原始任务重新生成完整 plan，严格按 JSON 输出。',
      '',
      '要求：',
      '- 仅返回 JSON',
      '- 包含 task 和 steps 字段',
      '- 每个 step 必须包含 id/title/description',
      '',
      'JSON 格式示例（只参考格式，不要照抄内容）：',
      '{',
      '  "task": "深入了解 Rust 编程语言（系统编程方向）",',
      '  "steps": [',
      '    {',
      '      "id": "step1",',
      '      "title": "了解 Rust 的核心特性",',
      '      "description": "使用 @webSearch 搜索 Rust 的所有权、借用检查与并发安全机制"',
      '    },',
      '    {',
      '      "id": "step2",',
      '      "title": "调研 Rust 在系统编程的应用",',
      '      "description": "使用 @webSearch 搜索 Rust 在操作系统、网络编程、嵌入式中的典型项目"',
      '    }',
      '  ]',
      '}'
    ].join('\n');

    const regenerateResponse = await createLLMResponse({
      isAborted: checkIsStopping,
      body: {
        model: modelData.model,
        messages: [
          ...requestMessages,
          {
            role: 'assistant',
            ...(answerText && { content: answerText }),
            ...(toolCalls.length > 0 && { tool_calls: toolCalls })
          },
          {
            role: 'user',
            content: regeneratePrompt
          }
        ],
        stream: true,
        tools: props.mode === 'continue' ? undefined : [AIAskTool],
        tool_choice: 'auto',
        toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
        parallel_tool_calls: false
      }
    });
    if (regenerateResponse.responseEmptyTip) {
      return Promise.reject(regenerateResponse.responseEmptyTip);
    }

    usage.inputTokens += regenerateResponse.usage.inputTokens;
    usage.outputTokens += regenerateResponse.usage.outputTokens;
    llmRequestIds.push(regenerateResponse.requestId);
    completeMessages = regenerateResponse.completeMessages;

    askInteractive = await parseAskInteractive(regenerateResponse.toolCalls || []);
    if (!askInteractive) {
      plan = await parsePlan({
        text: regenerateResponse.answerText,
        task,
        description,
        background
      });
    }

    if (!askInteractive && !plan) {
      getLogger(LogCategories.MODULE.AI.AGENT).warn('[Plan Agent] plan regenerate failed', {
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
      completeMessages = [];
    }
  }

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });

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
