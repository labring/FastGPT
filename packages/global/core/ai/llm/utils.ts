import type { ChatCompletionMessageParam } from './type';
import type { LLMModelDataType } from '../model/schema';
import { ChatCompletionRequestMessageRoleEnum } from '../constants';

export const removeDatasetCiteText = (text: string, retainDatasetCite: boolean) => {
  return retainDatasetCite
    ? text.replace(/[\[【]id[\]】]\(CITE\)/g, '')
    : text
        .replace(/[\[【]([a-f0-9]{24})[\]】](?:\([^\)]*\)?)?/g, '')
        .replace(/[\[【]id[\]】]\(CITE\)/g, '');
};

/**
 * 规范化会写入 LLM tool message 的工具响应。
 * OpenAI 兼容接口通常不接受空 tool content；undefined 和空字符串统一兜底为 none。
 */
export const normalizeToolResponseContent = (response?: string) =>
  response === '' || response === undefined ? 'none' : response;

/**
 * 构造 OpenAI Chat Completions 风格的流式 delta 响应片段。
 *
 * FastGPT 多个 SSE 场景都会向前端输出这种结构，统一放在 LLM 公共层避免各业务重复维护。
 */
export const createChatCompletionDeltaResponse = ({
  text,
  reasoningContent,
  model = '',
  finishReason = null,
  extraData = {}
}: {
  model?: string;
  text?: string | null;
  reasoningContent?: string | null;
  finishReason?: null | 'stop';
  extraData?: object;
}) => {
  return {
    ...extraData,
    id: '',
    object: '',
    created: 0,
    model,
    choices: [
      {
        delta: {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: text,
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {})
        },
        index: 0,
        finish_reason: finishReason
      }
    ]
  };
};

export const getLLMSupportParams = (llm?: Pick<LLMModelDataType, 'config'>) => {
  const config = llm?.config;
  return {
    vision: !!config?.vision,
    audio: !!config?.audio,
    video: !!config?.video,
    multimodal: !!(config?.vision || config?.audio || config?.video),
    temperature: typeof config?.maxTemperature === 'number',
    reasoning: !!config?.reasoning,
    reasoningEffort: !!config?.reasoningEffort,
    topP: !!config?.showTopP,
    stop: !!config?.showStopSign,
    responseFormat: !!(config?.responseFormatList && config.responseFormatList.length > 0),
    supportToolCall: !!(config?.toolChoice || config?.functionCall)
  };
};

/** 合并模型实际产生的协议消息；续跑工具结果按 ID 原位回填，绝不合并独立 assistant 回复。 */
export const mergeModelMessages = (
  messages: ChatCompletionMessageParam[],
  incomingMessages: ChatCompletionMessageParam[]
) => {
  const result = [...messages];
  for (const message of incomingMessages) {
    if (message.role === 'tool') {
      const callIndex = result.findLastIndex(
        (item) =>
          item.role === 'assistant' &&
          item.tool_calls?.some((call) => call.id === message.tool_call_id)
      );
      const index = result.findIndex(
        (item, index) =>
          index > callIndex && item.role === 'tool' && item.tool_call_id === message.tool_call_id
      );
      if (index >= 0) {
        result[index] = message;
        continue;
      }
    }
    // piAgent 可能先回传工具结果，再补发该轮 assistant，保留 provider 的插入语义。
    if (message.role === 'assistant' && message.tool_calls?.length) {
      const callIds = new Set(message.tool_calls.map((call) => call.id));
      const index = result.findIndex(
        (item, index) =>
          item.role === 'tool' &&
          callIds.has(item.tool_call_id) &&
          !result
            .slice(0, index)
            .some(
              (previous) =>
                previous.role === 'assistant' &&
                previous.tool_calls?.some((call) => call.id === item.tool_call_id)
            )
      );
      if (index >= 0) {
        result.splice(index, 0, message);
        continue;
      }
    }
    result.push(message);
  }
  return result;
};
