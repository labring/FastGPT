import type { LLMSystemModelDataType } from '../model/schema';
import { ChatCompletionRequestMessageRoleEnum } from '../constants';
import { imageFileType } from '../../../common/file/constants';
import { isHttpUrl } from '../../../common/string/url';
import type { ChatCompletionToolMessageContentPart } from './type';

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
 * 判断字符串是否恰好是一个图片链接（http/https，扩展名命中图片白名单）。
 * 只在“整串就是一个链接”时返回 true，避免从 HTML 等普通文本里误提取图片。
 */
export const isExactImageUrl = (url: string) => {
  if (!isHttpUrl(url)) return false;
  const pathname = url.trim().split('?')[0].split('#')[0];
  const extension = `.${pathname.split('/').pop()?.split('.').pop()?.toLowerCase() || ''}`;
  return (
    extension !== '.' &&
    imageFileType.split(',').some((item) => item.trim().toLowerCase() === extension)
  );
};

/**
 * 构造写入 LLM tool message 的 content：
 * - 工具主动返回 content parts 时，调用方直接使用 parts；
 * - 否则当整个响应字符串恰好是一个图片链接时，转成 image_url part 兜底；
 * - 其余情况保持纯文本字符串。
 */
export const getToolResponseContent = (
  response?: string
): string | ChatCompletionToolMessageContentPart[] => {
  const normalized = normalizeToolResponseContent(response);
  const trimmed = normalized.trim();
  if (trimmed && isExactImageUrl(trimmed)) {
    return [{ type: 'image_url', image_url: { url: trimmed } }];
  }
  return normalized;
};

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

export const getLLMSupportParams = (llm?: Pick<LLMSystemModelDataType, 'config'>) => {
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
