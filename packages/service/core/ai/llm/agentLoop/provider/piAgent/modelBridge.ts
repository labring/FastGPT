import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import { getSupportedReasoningEfforts } from '@fastgpt/global/core/ai/llm/utils';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import {
  defaultUserOpenAIBaseUrl,
  getOpenaiBaseUrl,
  getOpenaiBaseKey,
  getAiproxyScopeHeaders
} from '../../../../config';
import { getLegacyModelEndpoint } from '../../../../legacy/requestUrl';
import { computedMaxToken } from '../../../../utils';
import type { LLMModelDataType, ReasoningEffortLevel } from '@fastgpt/global/core/ai/model/schema';

type Model = import('@mariozechner/pi-ai').Model<'openai-completions'>;

const normalizeBaseUrl = (url?: string) => (url ? url.replace(/\/chat\/completions$/, '') : '');

/**
 * 解析 Pi Agent 出站应发送的思考等级：
 * - 不支持思考或无可用思考等级时返回 undefined（不传 reasoning_effort）；
 * - 请求档位在模型支持列表内时原样保留（含显式 `'none'`）；
 * - 未指定或不在支持列表内（含模型不支持 `'none'` 时的旧 `'none'`）时，
 *   优先回退 `'medium'`，否则选取最低非 `'none'` 档位（若仅支持 `'none'` 则返回 `'none'`）。
 */
export function resolvePiReasoningEffort(
  modelData: LLMModelDataType,
  reasoningEffort?: ReasoningEffort
): ReasoningEffortLevel | undefined {
  const supportedLevels = getSupportedReasoningEfforts(modelData);
  if (supportedLevels.length === 0) {
    return undefined;
  }

  if (reasoningEffort && supportedLevels.includes(reasoningEffort)) {
    return reasoningEffort;
  }

  if (supportedLevels.includes('medium')) {
    return 'medium';
  }

  return supportedLevels.find((level) => level !== 'none') ?? supportedLevels[0];
}

export function getPiThinkingLevel(
  modelData: LLMModelDataType,
  reasoningEffort?: ReasoningEffort
): ThinkingLevel {
  const resolvedEffort = resolvePiReasoningEffort(modelData, reasoningEffort);
  if (!resolvedEffort || resolvedEffort === 'none') {
    return 'off';
  }
  return resolvedEffort;
}

/** 无鉴权自定义端点的占位 Key；仅用于阻止 pi-ai 回退宿主环境变量，实际请求头会被置空。 */
const NO_AUTH_API_KEY = '__fastgpt_no_auth__';

export function buildPiModel(
  modelData: LLMModelDataType,
  useVision?: boolean,
  userKey?: OpenaiAccountType,
  maxTokens?: number
): Model {
  const hasUserOpenAIKey = !!userKey?.key;
  const legacyEndpoint = !hasUserOpenAIKey ? getLegacyModelEndpoint(modelData) : undefined;

  const fallbackBaseUrl = getOpenaiBaseUrl();
  const fallbackBaseKey = getOpenaiBaseKey();

  const baseUrl = hasUserOpenAIKey
    ? normalizeBaseUrl(userKey?.baseUrl || defaultUserOpenAIBaseUrl) || fallbackBaseUrl
    : legacyEndpoint
      ? normalizeBaseUrl(legacyEndpoint.baseUrl) || fallbackBaseUrl
      : fallbackBaseUrl;

  const authorization = hasUserOpenAIKey
    ? `Bearer ${userKey.key}`
    : legacyEndpoint
      ? (legacyEndpoint.authorization ?? null)
      : fallbackBaseKey
        ? `Bearer ${fallbackBaseKey}`
        : undefined;

  const scopeHeaders = getAiproxyScopeHeaders(modelData, baseUrl);
  const headers: Record<string, string | null> = {
    ...(authorization !== undefined ? { Authorization: authorization } : {}),
    ...scopeHeaders
  };

  const defaultMaxTokens = Math.min(
    modelData.config.maxResponse,
    modelData.config.maxContext - 2048
  );
  const resolvedMaxTokens =
    typeof maxTokens === 'number'
      ? computedMaxToken({
          model: modelData,
          maxToken: maxTokens
        })
      : undefined;

  return {
    id: modelData.model,
    name: modelData.name,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl,
    reasoning: modelData.config.reasoning ?? false,
    input: useVision ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: modelData.config.maxContext,
    maxTokens: resolvedMaxTokens ?? defaultMaxTokens,
    headers: Object.keys(headers).length > 0 ? (headers as Record<string, string>) : undefined,
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      supportsReasoningEffort: getSupportedReasoningEfforts(modelData).length > 0,
      maxTokensField: 'max_tokens'
    }
  };
}

export function getModelApiKey(modelData: LLMModelDataType, userKey?: OpenaiAccountType): string {
  if (userKey?.key) return userKey.key;
  const legacyEndpoint = getLegacyModelEndpoint(modelData);
  // 命中自定义端点时不能回退到 AIPROXY_API_TOKEN；
  // 无鉴权端点返回哨兵值，避免 pi-ai 继续回退宿主 OPENAI_API_KEY。
  return legacyEndpoint ? legacyEndpoint.apiKey || NO_AUTH_API_KEY : getOpenaiBaseKey() || '';
}
