import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import { getLLMModel, assertModelActive } from '../../../../model';
import {
  defaultUserOpenAIBaseUrl,
  getAiproxyScopeHeaders,
  openaiBaseUrl,
  openaiBaseKey
} from '../../../../config';
import { computedMaxToken } from '../../../../utils';

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
  modelId: string,
  reasoningEffort?: ReasoningEffort
): ThinkingLevel {
  const cfg = getLLMModel(modelId);
  if (!cfg?.reasoning || !cfg.reasoningEffort || reasoningEffort === 'none') {
    return 'off';
  }

  if (reasoningEffort && supportedThinkingLevels.has(reasoningEffort as ThinkingLevel)) {
    return reasoningEffort as ThinkingLevel;
  }

  return 'medium';
}

export function buildPiModel(
  modelId: string,
  useVision?: boolean,
  userKey?: OpenaiAccountType,
  maxTokens?: number
): Model {
  const cfg = getLLMModel(modelId);
  // Disabled models must never be callable (F2-S3-TC06).
  assertModelActive(cfg);
  const hasUserOpenAIKey = !!userKey?.key;
  // requestUrl/requestAuth were removed from models (now managed by Channels).
  // A user-supplied OpenAI key is a private credential that bypasses Channels, so its
  // baseUrl is still honored (and normalized); without a user key, fall back to env config.
  const baseUrl =
    normalizeBaseUrl(
      hasUserOpenAIKey ? userKey?.baseUrl || defaultUserOpenAIBaseUrl : openaiBaseUrl
    ) || openaiBaseUrl;
  const apiKey = hasUserOpenAIKey ? userKey.key : openaiBaseKey;
  const defaultMaxTokens = Math.min(cfg?.maxResponse ?? 4096, (cfg?.maxContext ?? 128000) - 2048);
  const resolvedMaxTokens =
    cfg && typeof maxTokens === 'number'
      ? computedMaxToken({
          modelData: cfg,
          maxToken: maxTokens
        })
      : undefined;

  return {
    id: cfg?.model ?? 'gpt-4o',
    name: cfg?.name ?? cfg?.model ?? 'gpt-4o',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl,
    reasoning: cfg?.reasoning ?? false,
    input: useVision ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: cfg?.maxContext ?? 128000,
    maxTokens: resolvedMaxTokens ?? defaultMaxTokens,
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      // Relay scope is a security attribute (design §2.9): pi-ai sends model.headers
      // on every request, so scope headers reach the aiproxy relay as well.
      ...getAiproxyScopeHeaders(cfg, baseUrl)
    },
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      supportsReasoningEffort: cfg?.reasoningEffort ?? false,
      maxTokensField: 'max_tokens'
    }
  };
}

export function getModelApiKey(userKey?: OpenaiAccountType): string {
  return userKey?.key || openaiBaseKey || '';
}
