import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { CreateLLMResponseProps, ResponseEvents } from '../../request';
import { createLLMResponse } from '../../request';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { compressRequestMessages, compressToolResponse } from '../../compress';
import { filterGPTMessageByMaxContext } from '../../utils';
import { getLLMModel } from '../../../model';
import { filterEmptyAssistantMessages } from './message';
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken/index';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { AgentLoopChildrenInteractiveParams, AgentLoopToolChildrenInteractive } from './type';

const AGENT_CALL_USAGE_MODULE_NAME = 'account_usage:agent_call';
const DEFERRED_STREAM_REPLAY_INTERVAL_MS = 16;
const DEFERRED_STREAM_REPLAY_MIN_CHARS = 24;
const DEFERRED_STREAM_REPLAY_MAX_TICKS = 160;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type RunAgentCallProps<TChildrenResponse = unknown> = {
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

  childrenInteractiveParams?: AgentLoopChildrenInteractiveParams<TChildrenResponse>;
  // LLM 压缩后回调
  onAfterCompressContext?: (e: {
    usage: ChatNodeUsageType;
    requestIds: string[];
    seconds: number;
  }) => void;
  // 处理交互工具
  onRunInteractiveTool: (e: AgentLoopChildrenInteractiveParams<TChildrenResponse>) => Promise<{
    response: string;
    assistantMessages: ChatCompletionMessageParam[];
    usages: ChatNodeUsageType[];
    interactive?: TChildrenResponse;
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
    interactive?: TChildrenResponse;
    stop?: boolean;
  }>;
  // 模型准备以无工具调用结束时的本地停止检查。
  // 返回 feedbackMessage 时会把消息追加回同一个 loop，而不是让外层重新开一层循环。
  onStopCandidate?: (e: {
    requestIndex: number;
    requestId: string;
    requestMessages: ChatCompletionMessageParam[];
    assistantMessages: ChatCompletionMessageParam[];
    answerText: string;
  }) => Promise<
    | {
        allowStop: true;
      }
    | {
        allowStop: false;
        feedbackMessage?: ChatCompletionMessageParam;
        error?: unknown;
      }
  >;
  // 开启后，普通 answer/reasoning delta 会先按单轮 LLM 请求暂存。
  // 只有 stop candidate 被允许结束时才刷给调用方，避免被 stop gate 打回的草稿提前流到前端。
  deferStreamingUntilStopCandidate?: boolean;
  // 每轮 LLM 请求前动态调整流式策略和工具选择。
  // 当上层已经确认本轮只能是最终回答时，可关闭暂存并强制 tool_choice=none，让 answer 实时输出。
  getRequestControl?: (e: { runTimes: number; requestMessages: ChatCompletionMessageParam[] }) => {
    deferStreamingUntilStopCandidate?: boolean;
    toolChoice?: CreateLLMResponseProps['body']['tool_choice'];
  };
  // 每次 createLLMResponse 的生命周期回调。
  // workflow adapter 用它向客户端展示模型运行状态，并增量收集 requestId。
  onLLMRequestStart?: (e: { requestIndex: number; modelName: string }) => void;
  onLLMRequestEnd?: (e: {
    requestIndex: number;
    modelName: string;
    requestId: string;
    finishReason?: CompletionFinishReason;
    answerText?: string;
    reasoningText?: string;
    toolCalls?: ChatCompletionMessageToolCall[];
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalPoints: number;
    };
    seconds?: number;
    error?: unknown;
  }) => void;
} & ResponseEvents;

type RunAgentResponse<TChildrenResponse = unknown> = {
  requestIds: string[];
  error?: any;
  completeMessages: ChatCompletionMessageParam[]; // Loop request complete messages
  assistantMessages: ChatCompletionMessageParam[]; // Loop assistant response messages
  interactiveResponse?: AgentLoopToolChildrenInteractive<TChildrenResponse>;

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
      requestIds: result.requestIds ?? [],
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
export const runAgentLoop = async <TChildrenResponse = unknown>({
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
  onStopCandidate,
  deferStreamingUntilStopCandidate,
  getRequestControl,
  onLLMRequestStart,
  onLLMRequestEnd,

  onReasoning,
  onStreaming
}: RunAgentCallProps<TChildrenResponse>): Promise<RunAgentResponse<TChildrenResponse>> => {
  const modelData = getLLMModel(model);

  let runTimes = 0;
  let interactiveResponse: AgentLoopToolChildrenInteractive<TChildrenResponse> | undefined;

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

    // 正常完成该工具的响应，继续进行 LLM 调用
  }

  // Agent loop
  const requestIds: string[] = [];
  let consecutiveRequestToolTimes = 0; // 连续多次工具调用后会强制回答，避免模型自身死循环。
  while (runTimes < maxRunAgentTimes) {
    let stopAgentLoop = false;

    // 费用限制由 workflow 入口统一校验；这里保留单轮 usage 明细，便于上层累计。
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
          usage: compressResult.usage,
          requestIds: compressResult.requestIds,
          seconds: compressResult.seconds
        });
      }
    }

    // 拷贝一份 requestMessages 用于后续操作
    const cloneRequestMessages = requestMessages.slice();
    const requestControl = getRequestControl?.({
      runTimes,
      requestMessages: cloneRequestMessages
    });
    const shouldDeferCurrentResponse =
      requestControl?.deferStreamingUntilStopCandidate ?? deferStreamingUntilStopCandidate;
    const deferredResponseEvents: Array<
      | {
          type: 'reasoning';
          payload: { text: string };
        }
      | {
          type: 'streaming';
          payload: { text: string };
        }
    > = [];
    const mergeDeferredResponseEvents = (events: typeof deferredResponseEvents) =>
      events.reduce<typeof deferredResponseEvents>((result, event) => {
        const lastEvent = result[result.length - 1];
        if (lastEvent?.type === event.type) {
          lastEvent.payload.text += event.payload.text;
          return result;
        }

        result.push({
          type: event.type,
          payload: { text: event.payload.text }
        });
        return result;
      }, []);
    const getDeferredReplayChunkSize = (events: typeof deferredResponseEvents) => {
      const totalChars = events.reduce((sum, event) => sum + event.payload.text.length, 0);
      return Math.max(
        DEFERRED_STREAM_REPLAY_MIN_CHARS,
        Math.ceil(totalChars / DEFERRED_STREAM_REPLAY_MAX_TICKS)
      );
    };
    const flushDeferredResponseEvents = async () => {
      if (!shouldDeferCurrentResponse) return;

      const events = mergeDeferredResponseEvents(deferredResponseEvents.splice(0));
      const chunkSize = getDeferredReplayChunkSize(events);
      let emittedChunks = 0;

      for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
        const event = events[eventIndex];
        for (let i = 0; i < event.payload.text.length; i += chunkSize) {
          if (isAborted?.()) return;

          const payload = {
            text: event.payload.text.slice(i, i + chunkSize)
          };
          if (event.type === 'reasoning') {
            onReasoning?.(payload);
          } else {
            onStreaming?.(payload);
          }

          emittedChunks++;
          const hasMoreChunks =
            i + chunkSize < event.payload.text.length || eventIndex < events.length - 1;
          if (hasMoreChunks && emittedChunks < DEFERRED_STREAM_REPLAY_MAX_TICKS) {
            await sleep(DEFERRED_STREAM_REPLAY_INTERVAL_MS);
          }
        }
      }
    };
    const dropDeferredResponseEvents = () => {
      deferredResponseEvents.length = 0;
    };

    // 2. Request LLM
    const requestStartTime = Date.now();
    onLLMRequestStart?.({
      requestIndex: runTimes,
      modelName: modelData.name
    });
    const {
      requestId,
      answerText: answer,
      reasoningText: reasoning,
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
        tool_choice:
          requestControl?.toolChoice ?? (consecutiveRequestToolTimes > 5 ? 'none' : 'auto'),
        toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
        parallel_tool_calls: body.parallel_tool_calls ?? true
      },
      userKey,
      isAborted,
      onReasoning: (e) => {
        if (shouldDeferCurrentResponse) {
          deferredResponseEvents.push({
            type: 'reasoning',
            payload: e
          });
        } else {
          onReasoning?.(e);
        }
      },
      onStreaming: (e) => {
        if (shouldDeferCurrentResponse) {
          deferredResponseEvents.push({
            type: 'streaming',
            payload: e
          });
        } else {
          onStreaming?.(e);
        }
      },
      onToolCall,
      onToolParam
    });
    const totalPoints = userKey
      ? 0
      : formatModelChars2Points({
          model: modelData,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        }).totalPoints;
    onLLMRequestEnd?.({
      requestIndex: runTimes,
      modelName: modelData.name,
      requestId,
      finishReason,
      answerText: answer,
      reasoningText: reasoning || llmAssistantMessage?.reasoning_content,
      toolCalls,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalPoints
      },
      seconds: +((Date.now() - requestStartTime) / 1000).toFixed(2),
      error
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
      llmTotalPoints += totalPoints; // 每次调用单独计价后累加，保证梯度计费正确
      usagePush?.([
        {
          moduleName: AGENT_CALL_USAGE_MODULE_NAME,
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

      // 非最终回答轮次可以继续按原行为展示；统一 loop 会开启延迟流式，此时工具调用轮的文本也只作为内部草稿。
      if (toolCalls.length) {
        if (shouldDeferCurrentResponse) {
          dropDeferredResponseEvents();
        } else {
          await flushDeferredResponseEvents();
        }
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
        const compressionResult = await compressToolResponse({
          response,
          model: modelData,
          currentMessagesTokens,
          toolLength: toolCalls.length,
          reservedTokens: 8000, // 预留 8k tokens 给输出
          userKey
        });
        const { compressed: compressed_context, usage: compressionUsage } = compressionResult;
        if (compressionUsage) {
          childrenUsages.push(compressionUsage);
          usagePush([compressionUsage]);
          onAfterToolResponseCompress?.({
            call: tool,
            response: compressed_context,
            usage: compressionUsage,
            requestIds: compressionResult.requestIds ?? []
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
    if (toolCalls.length === 0 && !interactiveResponse && !stopAgentLoop && !isAborted?.()) {
      const stopResult = await onStopCandidate?.({
        requestIndex: runTimes,
        requestId,
        requestMessages,
        assistantMessages,
        answerText: answer
      });

      if (stopResult && !stopResult.allowStop) {
        if (stopResult.error) {
          dropDeferredResponseEvents();
          requestError = stopResult.error;
          break;
        }
        if (stopResult.feedbackMessage) {
          // 被 stop gate 打回的这次 assistant 输出只作为后续上下文，不作为最终可持久化回答。
          // requestMessages 保留它和 feedback，方便模型理解为何需要继续。
          if (
            llmAssistantMessage &&
            assistantMessages[assistantMessages.length - 1] === llmAssistantMessage
          ) {
            assistantMessages.pop();
          }
          dropDeferredResponseEvents();
          requestMessages.push(stopResult.feedbackMessage);
          continue;
        }
      }

      await flushDeferredResponseEvents();
    }

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
