import type { LLMModelItemType } from '../model.schema';
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

export const getLLMSupportParams = (llm?: LLMModelItemType) => {
  return {
    vision: !!llm?.vision,
    audio: !!llm?.audio,
    video: !!llm?.video,
    multimodal: !!(llm?.vision || llm?.audio || llm?.video),
    temperature: typeof llm?.maxTemperature === 'number',
    reasoning: !!llm?.reasoning,
    reasoningEffort: !!llm?.reasoningEffort,
    topP: !!llm?.showTopP,
    stop: !!llm?.showStopSign,
    responseFormat: !!(llm?.responseFormatList && llm?.responseFormatList.length > 0),
    supportToolCall: !!(llm?.toolChoice || llm?.functionCall)
  };
};
