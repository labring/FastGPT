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
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

type RunAgentCallProps = {
  maxRunAgentTimes: number;
  interactiveEntryToolParams?: WorkflowInteractiveResponseType['toolParams'];

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
    isEnd: boolean;
    [DispatchNodeResponseKeyEnum.interactive]?: InteractiveNodeResponseType;
  }>;
} & ResponseEvents;

type RunAgentResponse = {
  completeMessages: ChatCompletionMessageParam[];
  assistantResponses: AIChatItemValueItemType[];
  interactiveResponse?: WorkflowInteractiveResponseType;

  // Usage
  inputTokens: number;
  outputTokens: number;
  subAppUsages: ChatNodeUsageType[];
};

export const runAgentCall = async ({
  maxRunAgentTimes,
  interactiveEntryToolParams,
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
  let interactiveResponse: WorkflowInteractiveResponseType | undefined;

  let requestMessages = messages;

  // Handle interactive resumption: replace placeholder tool_result with actual user input
  if (interactiveEntryToolParams) {
    const targetToolCallId = interactiveEntryToolParams.toolCallId;
    const userInputMessage = messages.at(-1)!; // Latest user message
    console.dir(messages, { depth: null });

    // Find and replace the placeholder tool_result
    requestMessages = messages
      .map((msg) => {
        if (
          msg.role === 'tool' &&
          msg.tool_call_id === targetToolCallId &&
          (msg.content === '[Interactive mode activated, waiting for user input]' ||
            msg.content === '')
        ) {
          return {
            ...msg,
            content: userInputMessage.content
          } as any;
        }
        return msg;
      })
      .filter((msg, index) => {
        // Remove the duplicate user message at the end (since we used it to replace tool_result)
        if (index === messages.length - 1 && msg.role === 'user') {
          return false;
        }
        return true;
      }) as typeof messages;

    console.dir(requestMessages, { depth: null });
  }

  let inputTokens: number = 0;
  let outputTokens: number = 0;
  const subAppUsages: ChatNodeUsageType[] = [];

  // TODO: interactive rewrite messages

  while (runTimes < maxRunAgentTimes) {
    // TODO: 费用检测
    runTimes++;

    // TODO: Context agent compression

    // console.log(JSON.stringify({ messages: requestMessages, tools: subApps }, null, 2));
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

    // Tool run and concat messages
    let isEndSign = false;
    for await (const tool of toolCalls) {
      // TODO: 加入交互节点处理
      const {
        response,
        usages,
        isEnd,
        [DispatchNodeResponseKeyEnum.interactive]: interactive
      } = await handleToolResponse({
        call: tool,
        messages: requestMessages.slice(0, requestMessagesLength) // 取原来 request 的上下文
      });

      if (isEnd) {
        isEndSign = true;
      }

      // If interactive response is returned, set it and break the loop
      if (interactive) {
        interactiveResponse = {
          ...interactive,
          entryNodeIds: [],
          memoryEdges: [],
          nodeOutputs: [],
          toolParams: {
            entryNodeIds: [],
            memoryMessages: requestMessages.slice(requestMessagesLength),
            toolCallId: tool.id
          }
        } as WorkflowInteractiveResponseType;

        // Still need to provide tool_result for the current tool_use to satisfy API requirements
        requestMessages.push({
          tool_call_id: tool.id,
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          content: response
        });
        break;
      }

      requestMessages.push({
        tool_call_id: tool.id,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        content: response
      });
      subAppUsages.push(...usages);
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

    if (isEndSign || toolCalls.length === 0) {
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
