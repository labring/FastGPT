import type { LLMModelDataType, ReasoningEffortLevel } from '../model/schema';
import { ChatCompletionRequestMessageRoleEnum, REASONING_EFFORT_LEVELS } from '../constants';

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

/** 按 AI Proxy 思考等级标准顺序去重并返回合法思考等级列表。 */
export const normalizeReasoningEffortList = (
  levels?: readonly string[]
): ReasoningEffortLevel[] => {
  if (!Array.isArray(levels) || levels.length === 0) return [];
  const allowed = new Set(levels);
  return REASONING_EFFORT_LEVELS.filter((level) => allowed.has(level));
};

/**
 * 解析模型实际可用的思考等级列表（按 AI Proxy 标准顺序去重）。
 *
 * - 未开启深度思考或显式关闭思考配置时返回空数组；
 * - 显式配置了非空 reasoningEffortList 时以该列表为准；
 * - 开启 reasoningEffort: true 但 reasoningEffortList 缺失或为空数组时，统一兜底为全部等级。
 */
export const getSupportedReasoningEfforts = (
  llm?: Pick<LLMModelDataType, 'config'>
): ReasoningEffortLevel[] => {
  const config = llm?.config;
  if (!config?.reasoning || config.reasoningEffort === false) return [];

  const normalized = normalizeReasoningEffortList(config.reasoningEffortList);
  if (normalized.length > 0) {
    return normalized;
  }

  if (config.reasoningEffort) {
    return [...REASONING_EFFORT_LEVELS];
  }

  return [];
};

/**
 * 获取模型支持的最低思考等级（按 AI Proxy 强度从低到高选取：none < minimal < low < medium < high < xhigh）。
 *
 * 用于标题生成、问题引导、查询改写等需要最小化思考开销的辅助链路：
 * - 不支持思考或不支持配置思考等级的模型返回 undefined，避免误传 reasoning_effort 导致报错；
 * - 支持关闭思考的模型返回 'none'，不支持关闭思考的模型返回其支持的最低等级（如 'minimal' / 'low'）。
 */
export const getLowestReasoningEffort = (
  llm?: Pick<LLMModelDataType, 'config'>
): ReasoningEffortLevel | undefined => getSupportedReasoningEfforts(llm)[0];

export const getLLMSupportParams = (llm?: Pick<LLMModelDataType, 'config'>) => {
  const config = llm?.config;
  const reasoningEffortList = getSupportedReasoningEfforts(llm);
  return {
    vision: !!config?.vision,
    audio: !!config?.audio,
    video: !!config?.video,
    multimodal: !!(config?.vision || config?.audio || config?.video),
    temperature: typeof config?.maxTemperature === 'number',
    reasoning: !!config?.reasoning,
    reasoningEffort: reasoningEffortList.length > 0,
    reasoningEffortList,
    topP: !!config?.showTopP,
    stop: !!config?.showStopSign,
    responseFormat: !!(config?.responseFormatList && config.responseFormatList.length > 0),
    supportToolCall: !!(config?.toolChoice || config?.functionCall)
  };
};
