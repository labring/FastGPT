import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import {
  defaultUserOpenAIBaseUrl,
  openaiBaseUrl,
  openaiBaseKey,
  getAiproxyScopeHeaders
} from '../../../../config';
import { getLegacyModelEndpoint } from '../../../../legacy/requestUrl';
import { computedMaxToken } from '../../../../utils';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';

type Model = import('@mariozechner/pi-ai').Model<'openai-completions'>;

const normalizeBaseUrl = (url?: string) => (url ? url.replace(/\/chat\/completions$/, '') : '');
const supportedThinkingLevels = new Set<ThinkingLevel>([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh'
]);

export function getPiThinkingLevel(
  modelData: LLMModelDataType,
  reasoningEffort?: ReasoningEffort
): ThinkingLevel {
  if (
    !modelData.config.reasoning ||
    !modelData.config.reasoningEffort ||
    reasoningEffort === 'none'
  ) {
    return 'off';
  }

  if (reasoningEffort && supportedThinkingLevels.has(reasoningEffort as ThinkingLevel)) {
    return reasoningEffort as ThinkingLevel;
  }

  return 'medium';
}

export function buildPiModel(
  modelData: LLMModelDataType,
  useVision?: boolean,
  userKey?: OpenaiAccountType,
  maxTokens?: number
): Model {
  const hasUserOpenAIKey = !!userKey?.key;
  const legacyEndpoint = !hasUserOpenAIKey ? getLegacyModelEndpoint(modelData) : undefined;

  const baseUrl = hasUserOpenAIKey
    ? normalizeBaseUrl(userKey?.baseUrl || defaultUserOpenAIBaseUrl) || openaiBaseUrl
    : legacyEndpoint
      ? normalizeBaseUrl(legacyEndpoint.baseUrl) || openaiBaseUrl
      : openaiBaseUrl;

  const apiKey = hasUserOpenAIKey ? userKey.key : legacyEndpoint?.apiKey || openaiBaseKey;

  const scopeHeaders = getAiproxyScopeHeaders(modelData, baseUrl);
  const headers = {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      supportsReasoningEffort: modelData.config.reasoningEffort ?? false,
      maxTokensField: 'max_tokens'
    }
  };
}

export function getModelApiKey(modelData: LLMModelDataType, userKey?: OpenaiAccountType): string {
  if (userKey?.key) return userKey.key;
  const legacyEndpoint = getLegacyModelEndpoint(modelData);
  return legacyEndpoint?.apiKey || openaiBaseKey || '';
}
