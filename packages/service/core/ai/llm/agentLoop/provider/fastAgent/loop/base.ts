import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { CreateLLMResponseProps } from '../../../../request';
import { createLLMResponse } from '../../../../request';
import { compressRequestMessages, compressToolResponse } from '../../../../compress';
import { getLLMModel } from '../../../../../model';
import { filterEmptyAssistantMessages } from './message';
import { countGptMessagesTokens } from '../../../../../../../common/string/tiktoken';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type {
  AgentLoopChildrenInteractiveParams,
  AgentLoopInteractiveToolExecuteParams,
  AgentLoopToolExecutionResult,
  AgentLoopUsage
} from './type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { normalizeToolResponseContent } from '@fastgpt/global/core/ai/llm/utils';

type RunAgentCallProps<TChildrenResponse = unknown> = {
  maxRunAgentTimes: number;
  batchToolSize?: number;
  body: CreateLLMResponseProps['body'] & {
    tools: ChatCompletionTool[];
    temperature?: number;
    top_p?: number;
    stream?: boolean;
  };

  isAborted: CreateLLMResponseProps['isAborted'];
  userKey?: CreateLLMResponseProps['userKey'];
  teamId: string;

  childrenInteractiveParams?: AgentLoopChildrenInteractiveParams<TChildrenResponse>;
  // LLM 压缩后回调
  onAfterCompressContext?: (e: {
    usage?: AgentLoopUsage;
    requestIds: string[];
    seconds: number;
    contextCheckpoint?: string;
  }) => void;
  // 处理交互工具
  onRunInteractiveTool: (
    e: AgentLoopInteractiveToolExecuteParams<TChildrenResponse>
  ) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  // 处理工具响应
  onRunTool: (e: {
    call: ChatCompletionMessageToolCall;
    messages: ChatCompletionMessageParam[];
    assistantMessage?: ChatCompletionMessageParam;
  }) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  // 返回 false 的工具会按 toolCalls 顺序串行执行，用于 update_plan/ask_user 这类有状态内部工具。
  canBatchTool?: (call: ChatCompletionMessageToolCall) => boolean;
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
    seconds: number;
    error?: unknown;
  }) => void;
  onToolRunEnd?: (e: {
    call: ChatCompletionMessageToolCall;
    rawResponse: string;
    response: string;
    assistantMessages?: ChatCompletionMessageParam[];
    errorMessage?: string;
    seconds: number;
    usages?: AgentLoopUsage[];
    metadata?: unknown;
    toolResponseCompress?: {
      response: string;
      usage: AgentLoopUsage;
      requestIds: string[];
      seconds: number;
    };
  }) => void;
  onToolCall?: (e: { call: ChatCompletionMessageToolCall }) => void;
  onToolParam?: (e: { call: ChatCompletionMessageToolCall; argsDelta: string }) => void;
  onToolRunStart?: (e: { call: ChatCompletionMessageToolCall }) => void;
  onStreaming?: (e: { text: string }) => void;
  onReasoning?: (e: { text: string }) => void;
};

type RunAgentResponse<TChildrenResponse = unknown> = {
  requestIds: string[];
  error?: any;
  completeMessages: ChatCompletionMessageParam[]; // Loop request complete messages
  assistantMessages: ChatCompletionMessageParam[]; // Loop assistant response messages
  toolChildPause?: {
    childrenResponse: TChildrenResponse;
    toolCallId: string;
  };

  // Usage
  model: string;
  inputTokens: number;
  outputTokens: number;
  llmTotalPoints: number; // 每次 LLM 调用单独计价后的累计价格（用于梯度计费）
  contextCheckpoint?: string;

  finish_reason: CompletionFinishReason | undefined;
};

/**
 * 上下文压缩，内部会判断是否需要压缩
 */
export const onCompressContext = async ({
  isAborted,
  messageTokens,
  requestMessages,
  modelData,
  reasoningEffort,
  tools,
  userKey,
  teamId
}: {
  isAborted: RunAgentCallProps['isAborted'];
  messageTokens?: number;
  requestMessages: ChatCompletionMessageParam[];
  modelData: LLMModelItemType;
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  tools?: ChatCompletionTool[];
  userKey: RunAgentCallProps['userKey'];
  teamId: RunAgentCallProps['teamId'];
}) => {
  const compressStartTime = Date.now();
  const result = await compressRequestMessages({
    checkIsStopping: isAborted,
    messageTokens,
    messages: requestMessages,
    model: modelData,
    reasoningEffort,
    tools,
    userKey,
    teamId
  });
  if (result.usage || result.contextCheckpoint || result.messages !== requestMessages) {
    return {
      messages: result.messages,
      messageTokens: result.messageTokens,
      hasCompressedContext: true,
      usage: result.usage,
      requestIds: result.requestIds ?? [],
      seconds: +((Date.now() - compressStartTime) / 1000).toFixed(2),
      contextCheckpoint: result.contextCheckpoint
    };
  }

  return {
    messages: result.messages,
    messageTokens: result.messageTokens,
    hasCompressedContext: false,
    requestIds: result.requestIds ?? [],
    seconds: +((Date.now() - compressStartTime) / 1000).toFixed(2)
  };
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
  batchToolSize = 1,
  body: { model, messages, max_tokens, ...body },

  userKey,
  teamId,
  isAborted,

  onAfterCompressContext,
  childrenInteractiveParams,
  onRunInteractiveTool,

  onToolCall,
  onToolParam,
  onToolRunStart,
  onToolRunEnd,
  onRunTool,
  canBatchTool = () => true,
  onLLMRequestStart,
  onLLMRequestEnd,

  onReasoning,
  onStreaming
}: RunAgentCallProps<TChildrenResponse>): Promise<RunAgentResponse<TChildrenResponse>> => {
  const modelData = getLLMModel(model);

  let runTimes = 0;
  let toolChildPause:
    | {
        childrenResponse: TChildrenResponse;
        toolCallId: string;
      }
    | undefined;

  // Init messages
  // 本轮产生的 assistantMessages，包括 tool 内产生的
  const assistantMessages: ChatCompletionMessageParam[] = [];
  // 多轮运行时候的请求 messages
  let requestMessages = messages.map((item) => {
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
  let requestMessagesTokenCount: number | undefined;

  /**
   * requestMessages 在未压缩时主要是 append-only。
   * 已知基线 token 后，只统计新增 message，避免每轮压缩判断都重复统计完整历史。
   */
  const appendRequestMessages = async (...newMessages: ChatCompletionMessageParam[]) => {
    requestMessages.push(...newMessages);
    if (requestMessagesTokenCount !== undefined && newMessages.length > 0) {
      requestMessagesTokenCount += await countGptMessagesTokens({
        messages: newMessages
      });
    }
  };

  let inputTokens: number = 0;
  let outputTokens: number = 0;
  let llmTotalPoints: number = 0; // 每次 LLM 调用单独计价后累加，避免梯度计费错误
  let finish_reason: CompletionFinishReason | undefined;
  let requestError: any;
  // Latest checkpoint text generated in this loop; caller persists it as hidden history.
  let contextCheckpoint: string | undefined;

  // 处理 tool 里的交互
  if (childrenInteractiveParams) {
    const toolStartTime = Date.now();
    const resumedToolCall = requestMessages
      .flatMap((message) =>
        message.role === ChatCompletionRequestMessageRoleEnum.Assistant
          ? message.tool_calls || []
          : []
      )
      .find((call) => call.id === childrenInteractiveParams.toolParams.toolCallId) ||
      // 兼容缺少 assistant tool_call 的旧交互快照；callId 仍能用于回填原工具卡片。
      {
        id: childrenInteractiveParams.toolParams.toolCallId,
        type: 'function' as const,
        function: {
          name: '',
          arguments: ''
        }
      };
    let interactiveToolErrorMessage: string | undefined;
    const {
      response,
      assistantMessages: toolAssistantMessages,
      usages: toolUsages,
      interactive,
      stop,
      errorMessage,
      metadata
    } = await (async () => {
      try {
        return await onRunInteractiveTool({
          ...childrenInteractiveParams,
          call: resumedToolCall,
          messages: requestMessages
        });
      } catch (error) {
        interactiveToolErrorMessage = `Tool error: ${getErrText(error)}`;
        return {
          response: interactiveToolErrorMessage,
          assistantMessages: [],
          usages: [],
          stop: false
        };
      }
    })();

    onToolRunEnd?.({
      call: resumedToolCall,
      rawResponse: response,
      response: normalizeToolResponseContent(response),
      assistantMessages: toolAssistantMessages,
      errorMessage: interactiveToolErrorMessage || errorMessage,
      seconds: +((Date.now() - toolStartTime) / 1000).toFixed(2),
      usages: toolUsages,
      metadata
    });

    // 将 requestMessages 复原成上一轮中断时的内容，并附上 tool response。
    // 新版 workflow interactive 不再持久化完整 messages 快照，调用方会从 chat history 重建；
    // 旧历史若仍带 memoryRequestMessages，则继续按旧快照恢复。
    const resumeMessages = childrenInteractiveParams.toolParams.memoryRequestMessages?.length
      ? childrenInteractiveParams.toolParams.memoryRequestMessages
      : requestMessages;
    requestMessages = resumeMessages.map((item) =>
      item.role === 'tool' && item.tool_call_id === childrenInteractiveParams.toolParams.toolCallId
        ? {
            ...item,
            content: normalizeToolResponseContent(response)
          }
        : item
    );

    // child interactive 的 tool_call 在上一轮已经产生；恢复后需要把 tool response
    // 放进本轮 transcript，外层才能回填旧工具卡并保证后续 history 重建使用真实结果。
    assistantMessages.push({
      role: ChatCompletionRequestMessageRoleEnum.Tool,
      tool_call_id: childrenInteractiveParams.toolParams.toolCallId,
      content: response
    });
    assistantMessages.push(...filterEmptyAssistantMessages(toolAssistantMessages));
    // 相同 tool 触发了多次交互, 调用的 toolId 认为是相同的
    if (interactive) {
      toolChildPause = {
        childrenResponse: interactive,
        toolCallId: childrenInteractiveParams.toolParams.toolCallId
      };
    }

    if (toolChildPause || stop) {
      return {
        requestIds: [],
        model: modelData.model,
        inputTokens: 0,
        outputTokens: 0,
        llmTotalPoints: 0,
        completeMessages: requestMessages,
        assistantMessages,
        toolChildPause,
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
        messageTokens: requestMessagesTokenCount,
        requestMessages,
        modelData,
        reasoningEffort: body.reasoning_effort,
        tools: body.tools,
        userKey,
        teamId
      });
      if (compressResult) {
        requestMessagesTokenCount = compressResult.messageTokens ?? requestMessagesTokenCount;
        if (compressResult.hasCompressedContext) {
          requestMessages = compressResult.messages;
          contextCheckpoint = compressResult.contextCheckpoint ?? contextCheckpoint;
          onAfterCompressContext?.({
            usage: compressResult.usage,
            requestIds: compressResult.requestIds,
            seconds: compressResult.seconds,
            contextCheckpoint: compressResult.contextCheckpoint
          });
        }
      }
    }

    // 工具执行使用本轮请求快照，工具结果随后单独追加到 requestMessages。
    const cloneRequestMessages = requestMessages.slice();

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
        model: modelData,
        messages: requestMessages,
        tool_choice: consecutiveRequestToolTimes > 5 ? 'none' : 'auto',
        toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
        parallel_tool_calls: body.parallel_tool_calls ?? true
      },
      userKey,
      teamId,
      isAborted,
      onReasoning,
      onStreaming,
      onToolCall,
      onToolParam
    });
    const totalPoints = usage.usedUserOpenAIKey
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
      error: error ?? responseEmptyTip
    });
    // 请求后赋值操作
    {
      finish_reason = finishReason;
      requestError = error;
      requestIds.push(requestId);

      if (requestError) {
        break;
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
      if (responseEmptyTip) {
        requestError = responseEmptyTip;
        break;
      }

      // 推送 AI 生成后的 assistantMessages
      if (llmAssistantMessage) {
        assistantMessages.push(llmAssistantMessage);
        await appendRequestMessages(llmAssistantMessage);
      }
    }

    if (toolCalls.length) {
      // 3. Call tools
      type ToolRunResult = {
        tool: ChatCompletionMessageToolCall;
        interactive?: TChildrenResponse;
        stopLoop?: boolean;
        toolMessage: ChatCompletionMessageParam;
        toolAssistantMessages: ChatCompletionMessageParam[];
      };

      const runTool = async ({
        tool
      }: {
        tool: ChatCompletionMessageToolCall;
      }): Promise<ToolRunResult> => {
        const toolStartTime = Date.now();
        let toolErrorMessage: string | undefined;
        onToolRunStart?.({
          call: tool
        });
        const {
          response,
          assistantMessages: toolAssistantMessages,
          usages: toolUsages,
          interactive,
          stop: stopLoop,
          skipResponseCompress,
          errorMessage,
          metadata
        } = await (async () => {
          try {
            return await onRunTool({
              call: tool,
              messages: cloneRequestMessages,
              assistantMessage: llmAssistantMessage
            });
          } catch (error) {
            toolErrorMessage = `Tool error: ${getErrText(error)}`;
            return {
              response: toolErrorMessage,
              assistantMessages: [],
              usages: [],
              stop: false
            };
          }
        })();
        // Compress tool response
        const { toolFinalResponse, toolResponseCompress } = await (async () => {
          if (skipResponseCompress) {
            return {
              toolFinalResponse: normalizeToolResponseContent(response)
            };
          }

          const compressStartTime = Date.now();
          const compressionResult = await compressToolResponse({
            response,
            model: modelData,
            reasoningEffort: body.reasoning_effort,
            userKey,
            teamId
          });
          const { compressed: compressed_context, usage: compressionUsage } = compressionResult;
          const normalizedCompressedContext = normalizeToolResponseContent(compressed_context);
          if (compressionUsage) {
            return {
              toolFinalResponse: normalizedCompressedContext,
              toolResponseCompress: {
                response: normalizedCompressedContext,
                usage: compressionUsage,
                requestIds: compressionResult.requestIds ?? [],
                seconds: +((Date.now() - compressStartTime) / 1000).toFixed(2)
              }
            };
          }

          return {
            toolFinalResponse: normalizedCompressedContext
          };
        })();

        onToolRunEnd?.({
          call: tool,
          rawResponse: response,
          response: toolFinalResponse,
          assistantMessages: toolAssistantMessages,
          ...(toolErrorMessage || errorMessage
            ? { errorMessage: toolErrorMessage || errorMessage }
            : {}),
          seconds: +((Date.now() - toolStartTime) / 1000).toFixed(2),
          usages: [...toolUsages, ...(toolResponseCompress ? [toolResponseCompress.usage] : [])],
          toolResponseCompress,
          metadata
        });

        return {
          tool,
          interactive,
          stopLoop,
          toolMessage: {
            tool_call_id: tool.id,
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            content: toolFinalResponse
          } as ChatCompletionMessageParam,
          toolAssistantMessages: filterEmptyAssistantMessages(toolAssistantMessages)
        };
      };

      // 按 toolCalls 原始顺序写回工具结果，保证后续 LLM 上下文稳定。
      const appendToolRunResults = async (toolRunResults: ToolRunResult[]) => {
        for (const {
          tool,
          interactive,
          stopLoop,
          toolMessage,
          toolAssistantMessages
        } of toolRunResults) {
          if (interactive) {
            toolChildPause = {
              childrenResponse: interactive,
              toolCallId: tool.id
            };
          }
          if (stopLoop) {
            stopAgentLoop = true;
          }

          assistantMessages.push(toolMessage);
          await appendRequestMessages(toolMessage);
          // toolAssistantMessages 也需要记录成 AI 响应，所以这里需要推送。
          assistantMessages.push(...toolAssistantMessages);
        }
      };

      const safeBatchToolSize = Math.max(1, batchToolSize);
      let toolIndex = 0;

      while (toolIndex < toolCalls.length) {
        const currentTool = toolCalls[toolIndex];

        // 只能串行的工具
        if (!canBatchTool(currentTool)) {
          const result = await runTool({
            tool: currentTool
          });
          await appendToolRunResults([result]);
          toolIndex++;

          // 交互或 stop 工具已经决定暂停当前 loop，不能再执行同一轮中排在后面的工具，
          // 否则会在用户回答前产生额外副作用，且恢复上下文无法准确反映实际执行顺序。
          if (toolChildPause || stopAgentLoop || isAborted?.()) {
            break;
          }
          continue;
        }

        // 可并行的工具一起执行
        const batchTools: ChatCompletionMessageToolCall[] = [];
        while (
          toolIndex < toolCalls.length &&
          batchTools.length < safeBatchToolSize &&
          canBatchTool(toolCalls[toolIndex])
        ) {
          batchTools.push(toolCalls[toolIndex]);
          toolIndex++;
        }

        const toolRunResults = await batchRun(
          batchTools,
          async (tool) =>
            runTool({
              tool
            }),
          safeBatchToolSize
        );
        await appendToolRunResults(toolRunResults);

        // 同一并发批次已经启动的工具无法撤回，但后续批次不应在暂停信号后继续调度。
        if (toolChildPause || stopAgentLoop || isAborted?.()) {
          break;
        }
      }
    }

    if (toolCalls.length === 0 || !!toolChildPause || stopAgentLoop || isAborted?.()) {
      break;
    }
  }

  return {
    requestIds,
    error: requestError,
    model: modelData.model,
    inputTokens,
    outputTokens,
    llmTotalPoints,
    contextCheckpoint,
    completeMessages: requestMessages,
    assistantMessages,
    toolChildPause,
    finish_reason
  };
};
