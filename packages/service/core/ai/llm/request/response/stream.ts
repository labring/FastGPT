import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageToolCall,
  StreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parseLLMStreamResponse } from '../../../utils';
import { parsePromptToolCall } from '../../promptCall';
import type { CompleteParams, CompleteResponse, CreateLLMResponseProps } from '../types';

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
        name: string;
        arguments: string;
        hasEmittedStart: boolean;
      };
      // 按 index 隔离每个并发工具调用，避免多工具交替吐字时状态污染
      const toolCallsMap = new Map<number, ToolCallAccumulator>();
      const toolNames = new Set(tools.map((tool) => tool.function.name));

      /** 还原供应商附加的 functions. 前缀，确保流式事件和最终工具调用使用相同名称。 */
      const normalizeToolName = (name: string) => name.replace(/^functions\./, '');

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
              const index = toolCall.index ?? i;

              if (!toolCallsMap.has(index)) {
                toolCallsMap.set(index, {
                  id: toolCall.id || getNanoid(6),
                  name: '',
                  arguments: '',
                  hasEmittedStart: false
                });
              }

              const current = toolCallsMap.get(index)!;
              if (toolCall.id) {
                current.id = toolCall.id;
              }
              if (toolCall.function?.name) {
                current.name += toolCall.function.name;
              }
              if (toolCall.function?.arguments) {
                current.arguments += toolCall.function.arguments;
              }

              // 工具名可能分片返回，命中本轮工具后才能派发事件，之前收到的参数先缓存。
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

      // 流结束统一规范化：容错 functions. 前缀，并将空 arguments 兜底为 "{}"
      const finalToolCalls: ChatCompletionMessageToolCall[] = Array.from(toolCallsMap.entries())
        .sort(([a], [b]) => a - b)
        .map<ChatCompletionMessageToolCall>(([, item]) => {
          const normalizedName = normalizeToolName(item.name);
          return {
            id: item.id,
            type: 'function',
            function: {
              name: normalizedName,
              arguments: item.arguments.trim() === '' ? '{}' : item.arguments
            }
          };
        })
        .filter((call) => toolNames.has(call.function.name));

      const result: CompleteResponse = {
        error,
        answerText: content,
        reasoningText: reasoningContent,
        finish_reason,
        usage,
        toolCalls: finalToolCalls
      };

      // 中途未匹配可能只是名称尚未收齐；只有模型明确以工具调用结束且全部无效时才报错。
      // 保留原始名称、参数和 usage，由入口层统一记录日志并按 throwError 决定是否抛出。
      if (!error && finish_reason === 'tool_calls' && finalToolCalls.length === 0) {
        return {
          ...result,
          finish_reason: 'error',
          error: new Error(
            'LLM tool call error: finish_reason=tool_calls but no valid tool calls matched the requested tools.',
            {
              cause: {
                finish_reason,
                expectedToolNames: [...toolNames],
                receivedToolCalls: Array.from(toolCallsMap, ([index, call]) => ({
                  index,
                  id: call.id,
                  type: 'function',
                  function: { name: call.name, arguments: call.arguments }
                }))
              }
            }
          )
        };
      }

      return result;
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
