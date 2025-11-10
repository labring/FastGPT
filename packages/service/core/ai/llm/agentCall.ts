import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { AIChatItemType, AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { CreateLLMResponseProps, ResponseEvents } from './request';
import { createLLMResponse } from './request';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { countGptMessagesTokens, countPromptTokens } from '../../../common/string/tiktoken/index';
import { addLog } from '../../../common/system/log';
import type { AgentPlanStepType } from '../../workflow/dispatch/ai/agent/sub/plan/type';
import { calculateCompressionThresholds } from './compress/constants';
import { compressRequestMessages, compressToolcallResponse } from './compress';

type RunAgentCallProps = {
  maxRunAgentTimes: number;
  interactiveEntryToolParams?: WorkflowInteractiveResponseType['toolParams'];
  currentStep: AgentPlanStepType;

  body: {
    messages: ChatCompletionMessageParam[];
    model: LLMModelItemType;
    temperature?: number;
    top_p?: number;
    stream?: boolean;
    subApps: ChatCompletionTool[];
  };

  userKey?: CreateLLMResponseProps['userKey'];
  isAborted?: CreateLLMResponseProps['isAborted'];

  getToolInfo: (id: string) => {
    name: string;
    avatar: string;
  };
  handleToolResponse: (e: {
    call: ChatCompletionMessageToolCall;
    messages: ChatCompletionMessageParam[];
  }) => Promise<{
    response: string;
    usages: ChatNodeUsageType[];
    interactive?: InteractiveNodeResponseType;
  }>;
} & ResponseEvents;

type RunAgentResponse = {
  completeMessages: ChatCompletionMessageParam[];
  assistantResponses: AIChatItemValueItemType[];
  interactiveResponse?: InteractiveNodeResponseType;

  // Usage
  inputTokens: number;
  outputTokens: number;
  subAppUsages: ChatNodeUsageType[];
};

export const runAgentCall = async ({
  maxRunAgentTimes,
  interactiveEntryToolParams,
  currentStep,
  body: { model, messages, stream, temperature, top_p, subApps },
  userKey,
  isAborted,

  handleToolResponse,
  getToolInfo,

  onReasoning,
  onStreaming,
  onToolCall,
  onToolParam
}: RunAgentCallProps): Promise<RunAgentResponse> => {
  let runTimes = 0;

  const assistantResponses: AIChatItemValueItemType[] = [];
  let interactiveResponse: InteractiveNodeResponseType | undefined;

  let requestMessages = messages;

  let inputTokens: number = 0;
  let outputTokens: number = 0;
  const subAppUsages: ChatNodeUsageType[] = [];

  // TODO: interactive rewrite messages

  while (runTimes < maxRunAgentTimes) {
    // TODO: 费用检测
    runTimes++;

    // 对请求的 requestMessages 进行压缩
    const taskDescription = currentStep.description || currentStep.title;
    if (taskDescription) {
      requestMessages = await compressRequestMessages(requestMessages, model, taskDescription);
    }

    // Request LLM
    let {
      reasoningText: reasoningContent,
      answerText: answer,
      toolCalls = [],
      usage,
      getEmptyResponseTip,
      completeMessages
    } = await createLLMResponse({
      body: {
        model,
        messages: requestMessages,
        tool_choice: 'auto',
        toolCallMode: model.toolChoice ? 'toolChoice' : 'prompt',
        tools: subApps,
        parallel_tool_calls: true,
        stream,
        temperature,
        top_p
      },
      userKey,
      isAborted,
      onReasoning,
      onStreaming,
      onToolCall,
      onToolParam
    });

    if (!answer && !reasoningContent && !toolCalls.length) {
      return Promise.reject(getEmptyResponseTip());
    }

    const requestMessagesLength = requestMessages.length;
    requestMessages = completeMessages.slice();

    for await (const tool of toolCalls) {
      // TODO: 加入交互节点处理

      // Call tool and compress tool response
      const { response, usages, interactive } = await handleToolResponse({
        call: tool,
        messages: requestMessages.slice(0, requestMessagesLength)
      }).then(async (res) => {
        const thresholds = calculateCompressionThresholds(model.maxContext);
        const toolTokenCount = await countPromptTokens(res.response);

        const response = await (async () => {
          if (toolTokenCount > thresholds.singleTool.threshold && currentStep) {
            const taskDescription = currentStep.description || currentStep.title;
            return await compressToolcallResponse(
              res.response,
              model,
              tool.function.name,
              taskDescription,
              thresholds.singleTool.target
            );
          } else {
            return res.response;
          }
        })();

        return {
          ...res,
          response
        };
      });

      requestMessages.push({
        tool_call_id: tool.id,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        content: response
      });

      subAppUsages.push(...usages);

      if (interactive) {
        interactiveResponse = interactive;
      }
    }

    // TODO: 移动到工作流里 assistantResponses concat
    const currentAssistantResponses = GPTMessages2Chats({
      messages: requestMessages.slice(requestMessagesLength),
      getToolInfo
    })[0] as AIChatItemType;
    if (currentAssistantResponses) {
      assistantResponses.push(...currentAssistantResponses.value);
    }

    // Usage concat
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;

    if (toolCalls.length === 0) {
      break;
    }
  }

  return {
    inputTokens,
    outputTokens,
    completeMessages: requestMessages,
    assistantResponses,
    subAppUsages,
    interactiveResponse
  };
};
