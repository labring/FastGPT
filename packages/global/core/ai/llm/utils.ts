import type { LLMModelItemType } from '../model.schema';

export const removeDatasetCiteText = (text: string, retainDatasetCite: boolean) => {
  return retainDatasetCite
    ? text.replace(/[\[【]id[\]】]\(CITE\)/g, '')
    : text
        .replace(/[\[【]([a-f0-9]{24})[\]】](?:\([^\)]*\)?)?/g, '')
        .replace(/[\[【]id[\]】]\(CITE\)/g, '');
};

export const getLLMSupportParams = (llm?: LLMModelItemType) => {
  return {
    vision: !!llm?.vision,
    temperature: typeof llm?.maxTemperature === 'number',
    reasoning: !!llm?.reasoning,
    reasoningEffort: !!llm?.reasoningEffort,
    topP: !!llm?.showTopP,
    stop: !!llm?.showStopSign,
    responseFormat: !!(llm?.responseFormatList && llm?.responseFormatList.length > 0),
    supportToolCall: !!(llm?.toolChoice || llm?.functionCall)
  };
};
