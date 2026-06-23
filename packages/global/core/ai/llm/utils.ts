import type { LLMModelItemType } from '../model.schema';

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
