import type {
  ChatCompletionCreateParams,
  ChatCompletionChunk,
  ChatCompletionMessageToolCall,
  StreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parseLLMStreamResponse } from '../../../utils';
import { parsePromptToolCall } from '../../promptCall';
import type { CompleteParams, CompleteResponse, CreateLLMResponseProps } from '../types';
import { normalizeNativeToolCalls, normalizeToolName } from './normalize';

/**
 * 解析 stream completion 响应。
 *
 * 三种分支分别处理：
 * - toolChoice：按身份聚合原生 tool_calls delta，同时保留过滤前的工具输出。
 * - prompt tool：模型把工具协议输出在文本里，需要先控制可见流式输出，再在结束后解析 tool_calls。
 * - 普通文本：只转发 reasoning 与正文 delta。
 */
export const createStreamResponse = async ({
  body,
  response,
  isAborted,
  onStreaming,
  onReasoning,
  onToolCall,
  onToolParam
}: CompleteParams & {
  response: StreamResponseType;
  isAborted?: CreateLLMResponseProps<ChatCompletionCreateParams>['isAborted'];
}): Promise<CompleteResponse> => {
  const { retainDatasetCite = true, tools, toolCallMode = 'toolChoice', model } = body;

  const { parsePart, getResponseData, updateFinishReason, updateError } = parseLLMStreamResponse();

  /** 统一读取、取消和异常捕获；各模式按原有顺序消费解析后的正文、思考和工具增量。 */
  const consumeStream = async (
    onPart: (data: ReturnType<typeof parsePart>, part: ChatCompletionChunk) => void
  ) => {
    try {
      for await (const part of response) {
        if (isAborted?.()) {
          // 用户中断是正常关闭，保留已经收到的内容。
          response.controller?.abort();
          updateFinishReason('close');
          break;
        }

        onPart(parsePart({ part, parseThinkTag: model.config.reasoning, retainDatasetCite }), part);
      }
    } catch (error: any) {
      // 包含读取和消费回调异常，先保留 parser 状态，再由上层决定是否抛出。
      updateError(error?.error || error);
    }
  };

  if (tools?.length) {
    if (toolCallMode === 'toolChoice') {
      type ToolCallAccumulator = {
        index?: number;
        id?: string;
        name: string;
        arguments: string;
        eventId?: string;
      };
      // 优先按 index 合并；仅当双方都缺 index 时按 id 匹配，不猜测无身份片段的归属。
      const toolCalls: ToolCallAccumulator[] = [];
      const toolNames = new Set(tools.map((tool) => tool.function.name));
      let toolCallError: Error | undefined;

      await consumeStream(({ reasoningContent, responseContent }, part) => {
        if (reasoningContent) {
          onReasoning?.({ text: reasoningContent });
        }
        if (responseContent) {
          onStreaming?.({ text: responseContent });
        }

        const responseChoice = part.choices?.[0]?.delta;
        if (responseChoice?.tool_calls?.length) {
          responseChoice.tool_calls.forEach((toolCall) => {
            // 协议冲突后继续读取正文和 usage，但不再派发可能串到其他工具的事件。
            if (toolCallError) return;
            const index = toolCall.index ?? undefined;
            const id = toolCall.id || undefined;
            const existing = toolCalls.find((call) => {
              if (index !== undefined && call.index !== undefined) {
                return call.index === index && (!call.id || !id || call.id === id);
              }
              return index === undefined && call.index === undefined && !!id && call.id === id;
            });
            const current: ToolCallAccumulator = existing ?? {
              index,
              id,
              name: '',
              arguments: ''
            };
            if (!existing) toolCalls.push(current);
            if (id) current.id = id;
            if (toolCall.function?.name) {
              const nextName = toolCall.function.name;
              if (current.name && normalizeToolName(current.name) !== normalizeToolName(nextName)) {
                toolCallError = new Error(
                  `LLM tool call error: tool name changed from ${current.name} to ${nextName}.`,
                  { cause: toolCall }
                );
                return;
              }
              // name 是完整身份字段；重复下发可忽略，arguments 才按 delta 拼接。
              current.name = nextName;
            }
            if (toolCall.function?.arguments) {
              current.arguments += toolCall.function.arguments;
            }

            // 名称晚于参数到达时先缓存参数，匹配本轮工具后一次性派发开始事件。
            const normalizedName = normalizeToolName(current.name);
            if (!toolNames.has(normalizedName)) return;

            const call: ChatCompletionMessageToolCall = {
              id: current.eventId ?? current.id ?? getNanoid(6),
              type: 'function',
              function: { name: normalizedName, arguments: current.arguments }
            };
            if (!current.eventId) {
              // eventId 同时标记开始事件已发送；上游 id 晚到时也保持对外身份不变。
              current.eventId = call.id;
              // 开始事件包含全部已缓存参数，本块不能再作为增量重复发送。
              onToolCall?.({ call });
              return;
            }

            const argDelta = toolCall.function?.arguments;
            if (argDelta) {
              onToolParam?.({ call, argsDelta: argDelta });
            }
          });
        }
      });

      const { reasoningContent, content, finish_reason, usage, error } = getResponseData();
      const rawToolCalls = toolCalls
        .sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER))
        .map((call) => ({
          ...(call.index !== undefined && { index: call.index }),
          id: call.eventId ?? call.id ?? getNanoid(6),
          ...(call.eventId && call.id && call.eventId !== call.id && { upstreamId: call.id }),
          type: 'function' as const,
          function: { name: call.name, arguments: call.arguments }
        }));

      return {
        // 接口错误优先；工具名称冲突仅作为普通解析错误返回，不承担原始记录的传递。
        error: error ?? toolCallError,
        answerText: content,
        reasoningText: reasoningContent,
        usage,
        finish_reason,
        rawToolCalls,
        toolCalls: toolCallError
          ? []
          : normalizeNativeToolCalls({ toolCalls: rawToolCalls, toolNames })
      };
    } else {
      let startResponseWrite = false;
      let answer = '';

      await consumeStream(({ reasoningContent, content, responseContent }) => {
        answer += content;

        if (reasoningContent) {
          onReasoning?.({ text: reasoningContent });
        }

        if (content) {
          if (startResponseWrite) {
            if (responseContent) {
              onStreaming?.({ text: responseContent });
            }
          } else if (answer.length >= 3) {
            answer = answer.trimStart();

            if (/0(:|：)/.test(answer)) {
              // prompt tool 协议中 0 表示普通回答，可以开始把内容流式展示给用户。
              startResponseWrite = true;

              const firstIndex =
                answer.indexOf('0:') !== -1 ? answer.indexOf('0:') : answer.indexOf('0：');
              answer = answer.substring(firstIndex + 2).trim();

              onStreaming?.({ text: answer });
            } else if (/1(:|：)/.test(answer)) {
              // 1 表示工具调用，工具协议内容不应作为可见回答提前输出。
            } else {
              // 兼容模型未按 0/1 前缀输出时，当作普通文本直接展示。
              startResponseWrite = true;
              onStreaming?.({ text: answer });
            }
          }
        }
      });

      const { reasoningContent, content, finish_reason, usage, error } = getResponseData();
      // prompt tool 模式结束后用完整文本解析最终回答和工具调用。
      const { answer: llmAnswer, streamAnswer, toolCalls } = parsePromptToolCall(content);

      if (streamAnswer) {
        onStreaming?.({ text: streamAnswer });
      }

      toolCalls?.forEach((call) => {
        onToolCall?.({ call });
      });

      return {
        error,
        answerText: llmAnswer,
        reasoningText: reasoningContent,
        finish_reason,
        usage,
        toolCalls
      };
    }
  } else {
    await consumeStream(({ reasoningContent, responseContent }) => {
      if (reasoningContent) {
        onReasoning?.({ text: reasoningContent });
      }
      if (responseContent) {
        onStreaming?.({ text: responseContent });
      }
    });

    const { reasoningContent, content, finish_reason, usage, error } = getResponseData();

    return {
      error,
      answerText: content,
      reasoningText: reasoningContent,
      finish_reason,
      usage
    };
  }
};
