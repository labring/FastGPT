import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import { getInitialPlanPrompt, getContinuePlanPrompt } from './prompt';
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

  historyMessages: ChatCompletionMessageParam[];
  interactive?: WorkflowInteractiveResponseType;
  userInput: string;
  background?: string;
  referencePlans?: string;

  completionTools: ChatCompletionTool[];
  getSubAppInfo: GetSubAppInfoFnType;

  mode?: PlanMode; // 'initial' | 'continue', 默认为 'initial'
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
  model,
  mode = 'initial'
}: DispatchPlanAgentProps): Promise<DispatchPlanAgentResponse> => {
  const modelData = getLLMModel(model);

  const parsedSystemPrompt = parseSystemPrompt({ systemPrompt, getSubAppInfo });

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
        parsedSystemPrompt
          ? `<user_background>
          ${parsedSystemPrompt}

          请参考用户的任务信息来匹配是否和当前的user_background一致，如果一致请优先遵循参考的步骤安排和偏好
          如果和user_background没有任何关系则忽略参考信息。

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
  }
  // else {
  //   requestMessages.push({
  //     role: 'user',
  //     content: userInput
  //   });
  // }

  if (mode === 'continue') {
    requestMessages.push({
      role: 'user',
      content: userInput
    });
  }
  console.log('Plan request messages');
  console.dir({ requestMessages }, { depth: null });
  console.log('userInput:', userInput, 'mode:', mode, 'interactive?.type:', interactive?.type);
  // console.log('lastMessages', JSON.stringify(lastMessages, null, 2))

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
