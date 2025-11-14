import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ToolCallChildrenInteractive,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { CreateLLMResponseProps, ResponseEvents } from '../request';
import { createLLMResponse } from '../request';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { compressRequestMessages } from '../compress';
import { computedMaxToken } from '../../utils';
import { filterGPTMessageByMaxContext } from '../utils';
import { getLLMModel } from '../../model';
import { filterEmptyAssistantMessages } from './utils';

type RunAgentCallProps = {
  maxRunAgentTimes: number;
  compressTaskDescription?: string;

  body: CreateLLMResponseProps['body'] & {
    tools: ChatCompletionTool[];

    temperature?: number;
    top_p?: number;
    stream?: boolean;
  };

  userKey?: CreateLLMResponseProps['userKey'];
  isAborted?: CreateLLMResponseProps['isAborted'];

  childrenInteractiveParams?: ToolCallChildrenInteractive['params'];
  handleInteractiveTool: (e: ToolCallChildrenInteractive['params']) => Promise<{
    response: string;
    assistantMessages: ChatCompletionMessageParam[];
    usages: ChatNodeUsageType[];
    interactive?: WorkflowInteractiveResponseType;
    stop?: boolean;
  }>;

  handleToolResponse: (e: {
    call: ChatCompletionMessageToolCall;
    messages: ChatCompletionMessageParam[];
  }) => Promise<{
    response: string;
    assistantMessages: ChatCompletionMessageParam[];
    usages: ChatNodeUsageType[];
    interactive?: WorkflowInteractiveResponseType;
    stop?: boolean;
  }>;
} & ResponseEvents;

type RunAgentResponse = {
  completeMessages: ChatCompletionMessageParam[]; // Step request complete messages
  assistantMessages: ChatCompletionMessageParam[]; // Step assistant response messages
  interactiveResponse?: ToolCallChildrenInteractive;

  // Usage
  inputTokens: number;
  outputTokens: number;
  subAppUsages: ChatNodeUsageType[];

  finish_reason: CompletionFinishReason | undefined;
};

/* 
  一个循环进行工具调用的 LLM 请求封装。

  AssistantMessages 组成：
  1. 调用 AI 时生成的 messages
  2. tool 内部调用产生的 messages
  3. tool 响应的值，role=tool，content=tool response

  RequestMessages 为模型请求的消息，组成:
  1. 历史对话记录
  2. 调用 AI 时生成的 messages
  3. tool 响应的值，role=tool，content=tool response

  memoryRequestMessages 为上一轮中断时，requestMessages 的内容
*/
export const runAgentCall = async ({
  maxRunAgentTimes,
  body: { model, messages, max_tokens, tools, ...body },
  userKey,
  isAborted,

  childrenInteractiveParams,
  handleInteractiveTool,
  handleToolResponse,

  onReasoning,
  onStreaming,
  onToolCall,
  onToolParam
}: RunAgentCallProps): Promise<RunAgentResponse> => {
  const modelData = getLLMModel(model);

  let runTimes = 0;
  let interactiveResponse: ToolCallChildrenInteractive | undefined;

  // Init messages
  const maxTokens = computedMaxToken({
    model: modelData,
    maxToken: max_tokens || 8000,
    min: 100
  });

  // 本轮产生的 assistantMessages，包括 tool 内产生的
  const assistantMessages: ChatCompletionMessageParam[] = [];
  // 多轮运行时候的请求 messages
  let requestMessages = (
    await filterGPTMessageByMaxContext({
      messages,
      maxContext: modelData.maxContext - (maxTokens || 0) // filter token. not response maxToken
    })
  ).map((item) => {
    if (item.role === 'assistant' && item.tool_calls) {
      return {
        ...item,
        tool_calls: item.tool_calls.map((tool) => ({
          id: tool.id,
          type: tool.type,
          function: tool.function
        }))
      };
    }
    return item;
  });

  let inputTokens: number = 0;
  let outputTokens: number = 0;
  let finish_reason: CompletionFinishReason | undefined;
  const subAppUsages: ChatNodeUsageType[] = [];

  // 处理 tool 里的交互
  if (childrenInteractiveParams) {
    const {
      response,
      assistantMessages: toolAssistantMessages,
      usages,
      interactive,
      stop
    } = await handleInteractiveTool(childrenInteractiveParams);

    // 将 requestMessages 复原成上一轮中断时的内容，并附上 tool response
    requestMessages = childrenInteractiveParams.toolParams.memoryRequestMessages.map((item) =>
      item.role === 'tool' && item.tool_call_id === childrenInteractiveParams.toolParams.toolCallId
        ? {
            ...item,
            content: response
          }
        : item
    );

    // 只需要推送本轮产生的 assistantMessages
    assistantMessages.push(...filterEmptyAssistantMessages(toolAssistantMessages));
    subAppUsages.push(...usages);

    // 相同 tool 触发了多次交互, 调用的 toolId 认为是相同的
    if (interactive) {
      // console.dir(interactive, { depth: null });
      interactiveResponse = {
        type: 'toolChildrenInteractive',
        params: {
          childrenResponse: interactive,
          toolParams: {
            memoryRequestMessages: requestMessages,
            toolCallId: childrenInteractiveParams.toolParams.toolCallId
          }
        }
      };
    }

    if (interactiveResponse || stop) {
      return {
        inputTokens: 0,
        outputTokens: 0,
        subAppUsages,
        completeMessages: requestMessages,
        assistantMessages,
        interactiveResponse,
        finish_reason: 'stop'
      };
    }

    // 正常完成该工具的响应，继续进行工具调用
  }

  // 自循环运行
  while (runTimes < maxRunAgentTimes) {
    // TODO: 费用检测

    runTimes++;

    // 1. Compress request messages
    const result = await compressRequestMessages({
      messages: requestMessages,
      model: modelData
    });
    requestMessages = result.messages;
    inputTokens += result.usage?.inputTokens || 0;
    outputTokens += result.usage?.outputTokens || 0;

    // 2. Request LLM
    let {
      reasoningText: reasoningContent,
      answerText: answer,
      toolCalls = [],
      usage,
      getEmptyResponseTip,
      assistantMessage: llmAssistantMessage,
      finish_reason: finishReason
    } = await createLLMResponse({
      body: {
        ...body,
        model,
        messages: requestMessages,
        tool_choice: 'auto',
        toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
        tools,
        parallel_tool_calls: true
      },
      userKey,
      isAborted,
      onReasoning,
      onStreaming,
      onToolCall,
      onToolParam
    });

    finish_reason = finishReason;

    if (!answer && !reasoningContent && !toolCalls.length) {
      return Promise.reject(getEmptyResponseTip());
    }

    // 3. 更新 messages
    const cloneRequestMessages = requestMessages.slice();
    // 推送 AI 生成后的 assistantMessages
    assistantMessages.push(...llmAssistantMessage);
    requestMessages.push(...llmAssistantMessage);

    // 4. Call tools
    let toolCallStep = false;
    for await (const tool of toolCalls) {
      const {
        response,
        assistantMessages: toolAssistantMessages,
        usages,
        interactive,
        stop
      } = await handleToolResponse({
        call: tool,
        messages: cloneRequestMessages
      });

      const toolMessage: ChatCompletionMessageParam = {
        tool_call_id: tool.id,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        content: response
      };

      // 5. Add tool response to messages
      assistantMessages.push(toolMessage);
      assistantMessages.push(...filterEmptyAssistantMessages(toolAssistantMessages)); // 因为 toolAssistantMessages 也需要记录成 AI 响应，所以这里需要推送。
      requestMessages.push(toolMessage); // 请求的 Request 只需要工具响应，不需要工具中 assistant 的内容，所以不推送 toolAssistantMessages

      subAppUsages.push(...usages);

      if (interactive) {
        interactiveResponse = {
          type: 'toolChildrenInteractive',
          params: {
            childrenResponse: interactive,
            toolParams: {
              memoryRequestMessages: [],
              toolCallId: tool.id
            }
          }
        };
      }
      if (stop) {
        toolCallStep = true;
      }
    }

    // 6 Record usage
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;

    if (toolCalls.length === 0 || !!interactiveResponse || toolCallStep) {
      break;
    }
  }

  if (interactiveResponse) {
    interactiveResponse.params.toolParams.memoryRequestMessages = requestMessages;
  }

  return {
    inputTokens,
    outputTokens,
    subAppUsages,
    completeMessages: requestMessages,
    assistantMessages,
    interactiveResponse,
    finish_reason
  };
};
