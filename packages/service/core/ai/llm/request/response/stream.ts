import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageToolCall,
  StreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parseLLMStreamResponse } from '../../../utils';
import { parsePromptToolCall } from '../../promptCall';
import { getLLMModel } from '../../../model';
import type { CompleteParams, CompleteResponse, CreateLLMResponseProps } from '../types';

/**
 * 解析 stream completion 响应。
 *
 * 三种分支分别处理：
 * - toolChoice：供应商原生返回 tool_calls delta。
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
  const modelData = getLLMModel(model);

  const { parsePart, getResponseData, updateFinishReason, updateError } = parseLLMStreamResponse();

  if (tools?.length) {
    if (toolCallMode === 'toolChoice') {
      let callingTool: ChatCompletionMessageToolCall['function'] | null = null;
      const toolCalls: ChatCompletionMessageToolCall[] = [];

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
            parseThinkTag: modelData.reasoning,
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
              // 多 tool 并发时必须按模型返回的 index 聚合参数，避免参数串到其他工具上。
              const index = toolCall.index ?? i;
              const hasNewTool = toolCall?.function?.name || callingTool;

              if (hasNewTool) {
                // 有些供应商会把 function.name 和 arguments 分片返回，先缓存到 callingTool。
                if (toolCall?.function?.name) {
                  callingTool = {
                    name: toolCall.function?.name || '',
                    arguments: toolCall.function?.arguments || ''
                  };
                } else if (callingTool) {
                  callingTool.name += toolCall.function?.name || '';
                  callingTool.arguments += toolCall.function?.arguments || '';
                }

                // 只有命中本轮请求传入的工具名时，才认为一个 tool call 已经开始。
                if (tools.find((item) => item.function.name === callingTool!.name)) {
                  const call: ChatCompletionMessageToolCall = {
                    id: toolCall.id || getNanoid(6),
                    type: 'function',
                    function: callingTool!
                  };
                  toolCalls[index] = call;
                  onToolCall?.({ call });
                  callingTool = null;
                }
              } else {
                const arg: string = toolCall?.function?.arguments ?? '';
                const currentTool = toolCalls[index];
                if (currentTool && arg) {
                  // 后续 arguments delta 直接追加到已创建的 tool call，并把增量同步给上层。
                  currentTool.function.arguments += arg;

                  onToolParam?.({ call: currentTool, argsDelta: arg });
                }
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
        error,
        answerText: content,
        reasoningText: reasoningContent,
        finish_reason,
        usage,
        toolCalls: toolCalls.filter((call) => !!call)
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
            parseThinkTag: modelData.reasoning,
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
          parseThinkTag: modelData.reasoning,
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
