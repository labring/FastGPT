import type {
  ChatCompletionMessageToolCall,
  CompletionFinishReason,
  UnStreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { parseReasoningContent } from '../../../utils';
import { parsePromptToolCall } from '../../promptCall';
import { getLLMModel } from '../../../model';
import type { CompleteParams, CompleteResponse } from '../types';

/**
 * 解析非 stream completion 响应。
 *
 * 输出会统一成 CompleteResponse，便于 createLLMResponse 和 stream 分支共用同一套聚合逻辑。
 * 非 stream 响应一次性拿到完整 message，因此这里直接处理 reasoning、正文和工具调用。
 */
export const createCompleteResponse = async ({
  body,
  response,
  onStreaming,
  onReasoning,
  onToolCall
}: CompleteParams & { response: UnStreamResponseType }): Promise<CompleteResponse> => {
  const { tools, toolCallMode = 'toolChoice', retainDatasetCite = true } = body;
  const modelData = getLLMModel(body.model);

  const finish_reason = response.choices?.[0]?.finish_reason as CompletionFinishReason;
  const usage = response.usage;

  const { content, reasoningContent } = (() => {
    const content = response.choices?.[0]?.message?.content || '';
    const reasoningContent: string =
      (response.choices?.[0]?.message as any)?.reasoning_content || '';

    if (reasoningContent || !modelData.reasoning) {
      return {
        content,
        reasoningContent
      };
    }

    // 部分模型不返回 reasoning_content，只把思考内容写在 <think> 标签里。
    const [think, answer] = parseReasoningContent(content);
    return {
      content: answer,
      reasoningContent: think
    };
  })();
  const formatReasonContent = removeDatasetCiteText(reasoningContent, retainDatasetCite);
  let formatContent = removeDatasetCiteText(content, retainDatasetCite);

  const { toolCalls } = (() => {
    if (tools?.length) {
      if (toolCallMode === 'toolChoice') {
        // 只接受 function tool calls，过滤掉兼容模型可能返回的 custom 等非标准类型。
        return {
          toolCalls:
            response.choices?.[0]?.message?.tool_calls?.filter(
              (call): call is ChatCompletionMessageToolCall => call.type === 'function'
            ) || []
        };
      }

      // prompt tool 模式下，模型把工具协议输出在文本中，需要二次解析回 tool_calls。
      const { answer, toolCalls } = parsePromptToolCall(formatContent);
      formatContent = answer;

      return {
        toolCalls
      };
    }

    return {
      toolCalls: undefined
    };
  })();

  if (formatReasonContent) {
    onReasoning?.({ text: formatReasonContent });
  }
  if (formatContent) {
    onStreaming?.({ text: formatContent });
  }
  if (toolCalls?.length && onToolCall) {
    // 保持与 stream 分支一致：解析出每个 tool call 后逐个回调给上层。
    toolCalls.forEach((call) => {
      onToolCall({ call });
    });
  }

  return {
    error: response.error,
    reasoningText: formatReasonContent,
    answerText: formatContent,
    toolCalls,
    finish_reason,
    usage
  };
};
