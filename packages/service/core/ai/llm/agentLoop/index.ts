import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ToolCallChildrenInteractive,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { CreateLLMResponseProps, ResponseEvents } from '../request';
import { createLLMResponse } from '../request';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { compressRequestMessages, compressToolResponse } from '../compress';
import { filterGPTMessageByMaxContext } from '../utils';
import { getLLMModel } from '../../model';
import { filterEmptyAssistantMessages } from './utils';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { i18nT } from '../../../../../web/i18n/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';

type RunAgentCallProps = {
  maxRunAgentTimes: number;
  body: CreateLLMResponseProps['body'] & {
    tools: ChatCompletionTool[];
    temperature?: number;
    top_p?: number;
    stream?: boolean;
  };

  usagePush: (usages: ChatNodeUsageType[]) => void;
  isAborted: CreateLLMResponseProps['isAborted'];
  userKey?: CreateLLMResponseProps['userKey'];

  childrenInteractiveParams?: ToolCallChildrenInteractive['params'];
  // LLM 压缩后回调
  onAfterCompressContext?: (usage: {
    modelName: string;
    inputTokens?: number;
    outputTokens?: number;
    totalPoints: number;
    seconds: number;
  }) => void;
  // 处理交互工具
  onRunInteractiveTool: (e: ToolCallChildrenInteractive['params']) => Promise<{
    response: string;
    assistantMessages: ChatCompletionMessageParam[];
    usages: ChatNodeUsageType[];
    interactive?: WorkflowInteractiveResponseType;
    stop?: boolean;
  }>;
  // 处理工具响应
  onRunTool: (e: {
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
  requestIds: string[];
  error?: any;
  completeMessages: ChatCompletionMessageParam[]; // Step request complete messages
  assistantMessages: ChatCompletionMessageParam[]; // Step assistant response messages
  interactiveResponse?: ToolCallChildrenInteractive;

  // Usage
  model: string;
  inputTokens: number;
  outputTokens: number;
  llmTotalPoints: number; // 每次 LLM 调用单独计价后的累计价格（用于梯度计费）
  compressInputTokens: number;
  compressOutputTokens: number;
  childrenUsages: ChatNodeUsageType[];

  finish_reason: CompletionFinishReason | undefined;
};

/**
 * 上下文压缩，内部会判断是否需要压缩
 */
export const onCompressContext = async ({
  isAborted,
  requestMessages,
  modelData,
  userKey
}: {
  isAborted: RunAgentCallProps['isAborted'];
  requestMessages: ChatCompletionMessageParam[];
  modelData: LLMModelItemType;
  userKey: RunAgentCallProps['userKey'];
}) => {
  const compressStartTime = Date.now();
  const result = await compressRequestMessages({
    checkIsStopping: isAborted,
    messages: requestMessages,
    model: modelData,
    userKey
  });
  if (result.usage) {
    return {
      messages: result.messages,
      usage: result.usage,
      seconds: +((Date.now() - compressStartTime) / 1000).toFixed(2)
    };
  }
};

/**
 * 一个循环调用工具的 LLM 请求封装。
 * 每次循环会进行以下操作：
 * 1. 压缩请求消息: 如果满足条件则压缩请求消息
 * 2. 请求 LLM
 * 3. 调用工具（如有）： Call、Compress response
 * 4. 检查是否循环结束
 */
export const runAgentLoop = async ({
  maxRunAgentTimes,
  body: { model, messages, max_tokens, ...body },

  userKey,
  usagePush,
  isAborted,

  onAfterCompressContext,
  childrenInteractiveParams,
  onRunInteractiveTool,

  onToolCall,
  onToolParam,
  onAfterToolResponseCompress,
  onAfterToolCall,
  onRunTool,

  onReasoning,
  onStreaming
}: RunAgentCallProps): Promise<RunAgentResponse> => {
  const modelData = getLLMModel(model);

  let runTimes = 0;
  let interactiveResponse: ToolCallChildrenInteractive | undefined;

  // Init messages
  // 本轮产生的 assistantMessages，包括 tool 内产生的
  const assistantMessages: ChatCompletionMessageParam[] = [];
  // 多轮运行时候的请求 messages
  let requestMessages = (
    await filterGPTMessageByMaxContext({
      messages,
      maxContext: modelData.maxContext - 8000 // 始终预留 8000 个 token 响应空间。
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
  let llmTotalPoints: number = 0; // 每次 LLM 调用单独计价后累加，避免梯度计费错误
  let compressInputTokens = 0;
  let compressOutputTokens = 0;
  let finish_reason: CompletionFinishReason | undefined;
  let requestError: any;
  const childrenUsages: ChatNodeUsageType[] = [];

  // 处理 tool 里的交互
  if (childrenInteractiveParams) {
    const {
      response,
      assistantMessages: toolAssistantMessages,
      usages,
      interactive,
      stop
    } = await onRunInteractiveTool(childrenInteractiveParams);

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
    childrenUsages.push(...usages);
    usagePush?.(usages);

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
        requestIds: [],
        model: modelData.model,
        inputTokens: 0,
        outputTokens: 0,
        llmTotalPoints: 0,
        compressInputTokens: 0,
        compressOutputTokens: 0,
        childrenUsages,
        completeMessages: requestMessages,
        assistantMessages,
        interactiveResponse,
        finish_reason: 'stop'
      };
    }

    // 正常完成该工具的响应，继续进行工具调用
  }

  // Agent loop
  const requestIds: string[] = [];
  let consecutiveRequestToolTimes = 0; // 连续多次工具调用后会强制回答，避免模型自身死循环。
  while (runTimes < maxRunAgentTimes) {
    let stopAgentLoop = false;

    // TODO: 费用检测
    runTimes++;

    // 1. Compress request messages
    {
      const compressResult = await onCompressContext({
        isAborted,
        requestMessages,
        modelData,
        userKey
      });
      if (compressResult) {
        requestMessages = compressResult.messages;
        compressInputTokens += compressResult.usage.inputTokens || 0;
        compressOutputTokens += compressResult.usage.outputTokens || 0;
        childrenUsages.push(compressResult.usage);
        usagePush?.([compressResult.usage]);
        onAfterCompressContext?.({
          modelName: modelData.name,
          inputTokens: compressResult.usage.inputTokens,
          outputTokens: compressResult.usage.outputTokens,
          totalPoints: compressResult.usage.totalPoints,
          seconds: compressResult.seconds
        });
      }
    }

    // 拷贝一份 requestMessages 用于后续操作
    const cloneRequestMessages = requestMessages.slice();

    // 2. Request LLM
    let {
      requestId,
      answerText: answer,
      toolCalls = [],
      usage,
      responseEmptyTip,
      assistantMessage: llmAssistantMessage,
      finish_reason: finishReason,
      error
    } = await createLLMResponse({
      throwError: false,
      body: {
        ...body,
        max_tokens,
        model,
        messages: requestMessages,
        tool_choice: consecutiveRequestToolTimes > 5 ? 'none' : 'auto',
        toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
        parallel_tool_calls: true
      },
      userKey,
      isAborted,
      onReasoning,
      onStreaming,
      onToolCall,
      onToolParam
    });
    // 请求后赋值操作
    {
      finish_reason = finishReason;
      requestError = error;
      requestIds.push(requestId);

      if (requestError) {
        break;
      }
      if (responseEmptyTip) {
        return Promise.reject(responseEmptyTip);
      }
      if (toolCalls.length) {
        consecutiveRequestToolTimes++;
      }
      if (answer) {
        consecutiveRequestToolTimes = 0;
      }

      // Record usage
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      const totalPoints = userKey
        ? 0
        : formatModelChars2Points({
            model: modelData,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens
          }).totalPoints;
      llmTotalPoints += totalPoints; // 每次调用单独计价后累加，保证梯度计费正确
      usagePush?.([
        {
          moduleName: i18nT('account_usage:agent_call'),
          model: modelData.name,
          totalPoints,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        }
      ]);

      // 推送 AI 生成后的 assistantMessages
      if (llmAssistantMessage) {
        assistantMessages.push(llmAssistantMessage);
        requestMessages.push(llmAssistantMessage);
      }
    }

    // 3. Call tools
    for await (const tool of toolCalls) {
      const {
        response,
        assistantMessages: toolAssistantMessages,
        usages: toolUsages,
        interactive,
        stop: stopLoop
      } = await onRunTool({
        call: tool,
        messages: cloneRequestMessages
      });

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
      if (stopLoop) {
        stopAgentLoop = true;
      }

      // Push usages
      {
        childrenUsages.push(...toolUsages);
        usagePush(toolUsages);
      }

      // Compress tool response
      const toolFinalResponse = await (async () => {
        const currentMessagesTokens = await countGptMessagesTokens(requestMessages);
        const { compressed: compressed_context, usage: compressionUsage } =
          await compressToolResponse({
            response,
            model: modelData,
            currentMessagesTokens,
            toolLength: toolCalls.length,
            reservedTokens: 8000, // 预留 8k tokens 给输出
            userKey
          });
        if (compressionUsage) {
          childrenUsages.push(compressionUsage);
          usagePush([compressionUsage]);
          onAfterToolResponseCompress?.({
            call: tool,
            response: compressed_context,
            usage: {
              inputTokens: compressionUsage.inputTokens!,
              outputTokens: compressionUsage.outputTokens!,
              totalPoints: compressionUsage.totalPoints!
            }
          });
        }

        return compressed_context;
      })();

      onAfterToolCall?.({ success: true, call: tool, response: toolFinalResponse });

      // Push messages
      {
        const toolMessage: ChatCompletionMessageParam = {
          tool_call_id: tool.id,
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          content: toolFinalResponse
        };
        assistantMessages.push(toolMessage);
        requestMessages.push(toolMessage);
        assistantMessages.push(...filterEmptyAssistantMessages(toolAssistantMessages)); // 因为 toolAssistantMessages 也需要记录成 AI 响应，所以这里需要推送。
      }
    }

    /**
     * 检查是否 loop 结束
     * 1. 没有工具调用
     * 2. 有交互工具
     * 3. 特殊的工具，要求结束当前 loop
     * 4. 用户主动暂停
     */
    if (toolCalls.length === 0 || !!interactiveResponse || stopAgentLoop || isAborted?.()) {
      break;
    }
  }

  if (interactiveResponse) {
    interactiveResponse.params.toolParams.memoryRequestMessages = requestMessages;
  }

  return {
    requestIds,
    error: requestError,
    model: modelData.model,
    inputTokens,
    outputTokens,
    llmTotalPoints,
    compressInputTokens,
    compressOutputTokens,
    childrenUsages,
    completeMessages: requestMessages,
    assistantMessages,
    interactiveResponse,
    finish_reason
  };
};
