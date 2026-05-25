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
import type { ContextCheckpointValueType } from '@fastgpt/global/core/chat/type';
import { compressRequestMessages, compressToolResponse } from '../../compress';
import { getLLMModel } from '../../../model';
import { filterEmptyAssistantMessages } from './message';
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken/index';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type {
  AgentLoopChildrenInteractiveParams,
  AgentLoopToolChildrenInteractive,
  AgentLoopToolExecutionResult
} from './type';
import { AgentUsageModuleName } from '../constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';

type RunAgentCallProps<TChildrenResponse = unknown> = {
  maxRunAgentTimes: number;
  batchToolSize?: number;
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
    contextCheckpoint?: ContextCheckpointValueType;
  }) => void;
  // 处理交互工具
  onRunInteractiveTool: (
    e: AgentLoopChildrenInteractiveParams<TChildrenResponse>
  ) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  // 处理工具响应
  onRunTool: (e: {
    call: ChatCompletionMessageToolCall;
    messages: ChatCompletionMessageParam[];
  }) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
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
  // 每轮 LLM 请求前动态调整流式策略和工具选择。
  // 当上层已经确认本轮只能是最终回答时，可强制 tool_choice=none。
  getRequestControl?: (e: { runTimes: number; requestMessages: ChatCompletionMessageParam[] }) => {
    toolChoice?: CreateLLMResponseProps['body']['tool_choice'];
  };
  // 返回 false 的工具会按 toolCalls 顺序串行执行，用于 update_plan/ask_agent 这类有状态内部工具。
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
  contextCheckpoint?: ContextCheckpointValueType;

  finish_reason: CompletionFinishReason | undefined;
};

/**
 * 上下文压缩，内部会判断是否需要压缩
 */
export const onCompressContext = async ({
  isAborted,
  requestMessages,
  modelData,
  reasoningEffort,
  userKey
}: {
  isAborted: RunAgentCallProps['isAborted'];
  requestMessages: ChatCompletionMessageParam[];
  modelData: LLMModelItemType;
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  userKey: RunAgentCallProps['userKey'];
}) => {
  const compressStartTime = Date.now();
  const result = await compressRequestMessages({
    checkIsStopping: isAborted,
    messages: requestMessages,
    model: modelData,
    reasoningEffort,
    userKey
  });
  if (result.usage) {
    return {
      messages: result.messages,
      usage: result.usage,
      requestIds: result.requestIds ?? [],
      seconds: +((Date.now() - compressStartTime) / 1000).toFixed(2),
      contextCheckpoint: result.contextCheckpoint
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
  batchToolSize = 1,
  body: { model, messages, max_tokens, ...body },

  userKey,
  usagePush,
  isAborted,

  onAfterCompressContext,
  childrenInteractiveParams,
  onRunInteractiveTool,

  onToolCall,
  onToolParam,
  onAfterToolCall,
  onRunTool,
  onStopCandidate,
  getRequestControl,
  canBatchTool = () => true,
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

  let inputTokens: number = 0;
  let outputTokens: number = 0;
  let llmTotalPoints: number = 0; // 每次 LLM 调用单独计价后累加，避免梯度计费错误
  let finish_reason: CompletionFinishReason | undefined;
  let requestError: any;
  // Latest checkpoint text generated in this loop; caller persists it as hidden history.
  let contextCheckpoint: ContextCheckpointValueType | undefined;

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
        reasoningEffort: body.reasoning_effort,
        userKey
      });
      if (compressResult) {
        requestMessages = compressResult.messages;
        contextCheckpoint = compressResult.contextCheckpoint ?? contextCheckpoint;
        usagePush?.([compressResult.usage]);
        onAfterCompressContext?.({
          usage: compressResult.usage,
          requestIds: compressResult.requestIds,
          seconds: compressResult.seconds,
          contextCheckpoint: compressResult.contextCheckpoint
        });
      }
    }

    // 拷贝一份 requestMessages 用于后续操作
    const cloneRequestMessages = requestMessages.slice();
    const requestControl = getRequestControl?.({
      runTimes,
      requestMessages: cloneRequestMessages
    });

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
        tool_choice:
          requestControl?.toolChoice ?? (consecutiveRequestToolTimes > 5 ? 'none' : 'auto'),
        toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
        parallel_tool_calls: body.parallel_tool_calls ?? true
      },
      userKey,
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
      usagePush?.([
        {
          moduleName: AgentUsageModuleName.agentCall,
          model: modelData.name,
          totalPoints,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        }
      ]);

      if (responseEmptyTip) {
        requestError = responseEmptyTip;
        break;
      }

      // 推送 AI 生成后的 assistantMessages
      if (llmAssistantMessage) {
        assistantMessages.push(llmAssistantMessage);
        requestMessages.push(llmAssistantMessage);
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
        tool,
        currentMessagesTokens
      }: {
        tool: ChatCompletionMessageToolCall;
        currentMessagesTokens: number;
      }): Promise<ToolRunResult> => {
        const toolStartTime = Date.now();
        let toolErrorMessage: string | undefined;
        const {
          response,
          assistantMessages: toolAssistantMessages,
          usages: toolUsages,
          interactive,
          stop: stopLoop,
          skipResponseCompress
        } = await (async () => {
          try {
            return await onRunTool({
              call: tool,
              messages: cloneRequestMessages
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

        // Push usages
        usagePush(toolUsages);

        // Compress tool response
        const { toolFinalResponse, toolResponseCompress } = await (async () => {
          if (skipResponseCompress) {
            return {
              toolFinalResponse: response
            };
          }

          const compressStartTime = Date.now();
          const compressionResult = await compressToolResponse({
            response,
            model: modelData,
            currentMessagesTokens,
            toolLength: toolCalls.length,
            reasoningEffort: body.reasoning_effort,
            userKey
          });
          const { compressed: compressed_context, usage: compressionUsage } = compressionResult;
          if (compressionUsage) {
            usagePush([compressionUsage]);
            return {
              toolFinalResponse: compressed_context,
              toolResponseCompress: {
                response: compressed_context,
                usage: compressionUsage,
                requestIds: compressionResult.requestIds ?? [],
                seconds: +((Date.now() - compressStartTime) / 1000).toFixed(2)
              }
            };
          }

          return {
            toolFinalResponse: compressed_context
          };
        })();

        onAfterToolCall?.({
          call: tool,
          response: toolFinalResponse,
          ...(toolErrorMessage ? { errorMessage: toolErrorMessage } : {}),
          seconds: +((Date.now() - toolStartTime) / 1000).toFixed(2),
          toolResponseCompress
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
      const appendToolRunResults = (toolRunResults: ToolRunResult[]) => {
        toolRunResults.forEach(
          ({ tool, interactive, stopLoop, toolMessage, toolAssistantMessages }) => {
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

            assistantMessages.push(toolMessage);
            requestMessages.push(toolMessage);
            // toolAssistantMessages 也需要记录成 AI 响应，所以这里需要推送。
            assistantMessages.push(...toolAssistantMessages);
          }
        );
      };

      const safeBatchToolSize = Math.max(1, batchToolSize);
      let toolIndex = 0;

      while (toolIndex < toolCalls.length) {
        const currentTool = toolCalls[toolIndex];
        const currentMessagesTokens = await countGptMessagesTokens({
          messages: requestMessages
        });

        // 只能串行的工具
        if (!canBatchTool(currentTool)) {
          const result = await runTool({
            tool: currentTool,
            currentMessagesTokens
          });
          appendToolRunResults([result]);
          toolIndex++;
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
              tool,
              currentMessagesTokens
            }),
          safeBatchToolSize
        );
        appendToolRunResults(toolRunResults);
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
          requestMessages.push(stopResult.feedbackMessage);
          continue;
        }
      }
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
    contextCheckpoint,
    completeMessages: requestMessages,
    assistantMessages,
    interactiveResponse,
    finish_reason
  };
};
