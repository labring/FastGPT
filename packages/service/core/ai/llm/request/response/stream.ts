import type {
  ChatCompletionCreateParams,
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
 * - toolChoice：供应商原生返回 tool_calls delta；以 tool_calls 结束时必须至少匹配一个有效工具。
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
  const modelData = model;

  const { parsePart, getResponseData, updateFinishReason, updateError } = parseLLMStreamResponse();

  if (tools?.length) {
    if (toolCallMode === 'toolChoice') {
      type ToolCallAccumulator = {
        id: string;
        upstreamId?: string;
        index?: number;
        arrayIndex: number;
        name: string;
        arguments: string;
        hasEmittedStart: boolean;
      };
      // index 是标准协议身份；缺 index 的兼容响应仅在稳定 id 能消歧时支持并行交错。
      const toolCalls: ToolCallAccumulator[] = [];
      const callsByIndex = new Map<number, ToolCallAccumulator>();
      const callsById = new Map<string, ToolCallAccumulator>();
      const toolNames = new Set(tools.map((tool) => tool.function.name));
      let protocolError: Parameters<typeof normalizeNativeToolCalls>[0]['protocolError'];

      try {
        for await (const part of response) {
          if (isAborted?.()) {
            // 用户中断属于正常关闭，不作为 error 处理。
            response.controller?.abort();
            updateFinishReason('close');
            break;
          }

          const { reasoningContent, responseContent } = parsePart({
            part,
            parseThinkTag: modelData.config.reasoning,
            retainDatasetCite
          });

          if (reasoningContent) {
            onReasoning?.({ text: reasoningContent });
          }
          if (responseContent) {
            onStreaming?.({ text: responseContent });
          }

          const responseChoice = part.choices?.[0]?.delta;
          if (responseChoice?.tool_calls?.length) {
            responseChoice.tool_calls.forEach((toolCall, i) => {
              // 协议冲突后继续读取正文和 usage，但不再派发可能串到其他工具的事件。
              if (protocolError) return;
              const index = toolCall.index ?? undefined;
              const upstreamId = toolCall.id ? toolCall.id : undefined;
              const indexedCall = index === undefined ? undefined : callsByIndex.get(index);
              const identifiedCall = upstreamId ? callsById.get(upstreamId) : undefined;
              const fallbackCalls =
                index === undefined && !identifiedCall
                  ? toolCalls.filter((call) => call.arrayIndex === i)
                  : [];
              const fallbackCall = fallbackCalls.length === 1 ? fallbackCalls[0] : undefined;

              if (index === undefined && !upstreamId && toolCalls.length > 1) {
                protocolError = {
                  message:
                    'LLM tool call error: parallel tool call delta is missing both index and id.',
                  toolCall
                };
                return;
              }

              if (
                index === undefined &&
                upstreamId &&
                !identifiedCall &&
                fallbackCalls.some((call) => !call.upstreamId)
              ) {
                // 未知 id 可能是晚到身份，也可能是另一个并发调用，不能凭数组位置合并。
                protocolError = {
                  message:
                    'LLM tool call error: late tool call id requires an index to identify the pending call.',
                  toolCall
                };
                return;
              }

              const existing =
                identifiedCall ?? indexedCall ?? (!upstreamId ? fallbackCall : undefined);
              const current: ToolCallAccumulator = existing ?? {
                id: upstreamId ?? getNanoid(6),
                arrayIndex: i,
                name: '',
                arguments: '',
                hasEmittedStart: false
              };

              if (
                (identifiedCall && indexedCall && identifiedCall !== indexedCall) ||
                (current.upstreamId && upstreamId && current.upstreamId !== upstreamId) ||
                (current.index !== undefined && index !== undefined && current.index !== index)
              ) {
                protocolError = {
                  message:
                    'LLM tool call error: tool call index and id identify conflicting calls.',
                  toolCall
                };
                return;
              }

              if (!existing) toolCalls.push(current);
              if (index !== undefined) {
                current.index = index;
                callsByIndex.set(index, current);
              }
              if (upstreamId) {
                current.upstreamId = upstreamId;
                callsById.set(upstreamId, current);
                // 晚到 id 仅补充上游身份映射，开始事件发出后对外 id 必须保持不变。
                if (!current.hasEmittedStart) current.id = upstreamId;
              }
              if (toolCall.function?.name) {
                const nextName = toolCall.function.name;
                if (
                  current.name &&
                  normalizeToolName(current.name) !== normalizeToolName(nextName)
                ) {
                  protocolError = {
                    message: `LLM tool call error: tool name changed from ${current.name} to ${nextName}.`,
                    toolCall
                  };
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
                id: current.id,
                type: 'function',
                function: { name: normalizedName, arguments: current.arguments }
              };
              if (!current.hasEmittedStart) {
                current.hasEmittedStart = true;
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
        }
      } catch (error: any) {
        // stream 迭代异常不立即抛出，先写入 parser 状态，最终由 createLLMResponse 决定是否 throw。
        updateError(error?.error || error);
      }

      const { reasoningContent, content, finish_reason, usage, error } = getResponseData();

      return {
        answerText: content,
        reasoningText: reasoningContent,
        usage,
        ...normalizeNativeToolCalls({
          toolCalls: toolCalls
            .sort((a, b) => (a.index ?? a.arrayIndex) - (b.index ?? b.arrayIndex))
            .map((call) => ({
              ...(call.index !== undefined && { index: call.index }),
              id: call.id,
              ...(call.upstreamId &&
                call.upstreamId !== call.id && { upstreamId: call.upstreamId }),
              type: 'function',
              function: { name: call.name, arguments: call.arguments }
            })),
          toolNames,
          finish_reason,
          error,
          protocolError
        })
      };
    } else {
      let startResponseWrite = false;
      let answer = '';

      try {
        for await (const part of response) {
          if (isAborted?.()) {
            // 与 toolChoice 分支一致：中断记录 close，保留已经收到的内容。
            response.controller?.abort();
            updateFinishReason('close');
            break;
          }

          const { reasoningContent, content, responseContent } = parsePart({
            part,
            parseThinkTag: modelData.config.reasoning,
            retainDatasetCite
          });
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
        }
      } catch (error: any) {
        // prompt tool 的解析依赖完整 content，stream 异常先挂到 response parser 上。
        updateError(error?.error || error);
      }

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
    try {
      for await (const part of response) {
        if (isAborted?.()) {
          // 普通文本流也保留已收到内容，中断状态由 finish_reason=close 表达。
          response.controller?.abort();
          updateFinishReason('close');
          break;
        }

        const { reasoningContent, responseContent } = parsePart({
          part,
          parseThinkTag: modelData.config.reasoning,
          retainDatasetCite
        });

        if (reasoningContent) {
          onReasoning?.({ text: reasoningContent });
        }
        if (responseContent) {
          onStreaming?.({ text: responseContent });
        }
      }
    } catch (error: any) {
      // 捕获底层流关闭/网络异常，避免丢掉已经解析出来的部分响应。
      updateError(error?.error || error);
    }

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
