import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import { getInitialPlanPrompt, getContinuePlanPrompt, parseUserSystemPrompt } from './prompt';
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
import { parseSystemPrompt } from '../../utils';
import { addLog } from '../../../../../../../common/system/log';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '../../../../../../../../web/i18n/utils';
import { SubAppIds } from '../constants';

type PlanAgentConfig = {
  systemPrompt?: string;
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type PlanMode = 'initial' | 'continue';

type DispatchPlanAgentProps = PlanAgentConfig & {
  checkIsStopping: () => boolean;

  defaultMessages: ChatCompletionMessageParam[];
  interactive?: WorkflowInteractiveResponseType;
  userInput?: string;
  background?: string;
  referencePlans?: string;

  completionTools: ChatCompletionTool[];
  getSubAppInfo: GetSubAppInfoFnType;

  mode: PlanMode; // 'initial' | 'continue', 默认为 'initial'
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

export const dispatchPlanAgent = async ({
  checkIsStopping,
  defaultMessages,
  userInput,
  interactive,
  completionTools,
  getSubAppInfo,
  systemPrompt,
  model,
  mode = 'initial'
}: DispatchPlanAgentProps): Promise<DispatchPlanAgentResponse> => {
  const modelData = getLLMModel(model);

  completionTools = completionTools.filter((item) => item.function.name !== SubAppIds.plan);

  // 根据 mode 选择对应的提示词
  const planPrompt =
    mode === 'continue'
      ? getContinuePlanPrompt({ getSubAppInfo, completionTools })
      : getInitialPlanPrompt({ getSubAppInfo, completionTools });

  const requestMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: [
        planPrompt,
        parseUserSystemPrompt({ userSystemPrompt: systemPrompt, getSubAppInfo })
      ]
        .filter(Boolean)
        .join('\n\n')
    },
    ...defaultMessages
  ];

  // 分类：query/user select/user form
  const lastMessages = requestMessages[requestMessages.length - 1];

  // 上一轮是 Ask 模式，进行工具调用拼接
  if (
    (interactive?.type === 'agentPlanAskUserForm' ||
      interactive?.type === 'agentPlanAskUserSelect' ||
      interactive?.type === 'agentPlanAskQuery') &&
    lastMessages.role === 'assistant' &&
    lastMessages.tool_calls &&
    userInput
  ) {
    requestMessages.push({
      role: 'tool',
      tool_call_id: lastMessages.tool_calls[0].id,
      content: userInput
    });
  } else if (userInput) {
    requestMessages.push({
      role: 'user',
      content: userInput
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
      tools: [AIAskTool],
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
        moduleName: i18nT('chat:plan_agent'),
        model: modelName,
        totalPoints,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ]
  };
};
