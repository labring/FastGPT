import { getLLMModel } from '../../../../../ai/model';

type Model = import('@mariozechner/pi-ai').Model<'openai-completions'>;

const aiProxyBaseUrl = process.env.AIPROXY_API_ENDPOINT
  ? `${process.env.AIPROXY_API_ENDPOINT}/v1`
  : undefined;
const defaultBaseUrl = aiProxyBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const defaultApiKey = process.env.AIPROXY_API_TOKEN || process.env.CHAT_API_KEY || '';

export function buildPiModel(modelNameOrId?: string, useVision?: boolean): Model {
  const cfg = getLLMModel(modelNameOrId);
  // requestUrl is the full endpoint (e.g. https://api.deepseek.com/chat/completions).
  // pi-ai's openai-completions provider appends /chat/completions automatically,
  // so we strip it to get baseUrl.
  const rawUrl = cfg?.requestUrl ?? '';
  const baseUrl = rawUrl ? rawUrl.replace(/\/chat\/completions$/, '') : defaultBaseUrl;
  const apiKey = cfg?.requestAuth || defaultApiKey;

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
    maxTokens: Math.min(cfg?.maxResponse ?? 4096, (cfg?.maxContext ?? 128000) - 2048),
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    // Most non-OpenAI endpoints don't support the "developer" role or "store" field.
    // Use "max_tokens" instead of OpenAI-specific "max_completion_tokens" for wider
    // compatibility with vLLM and other OpenAI-compatible servers.
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      maxTokensField: 'max_tokens'
    }
  };
}

export function getModelApiKey(modelNameOrId?: string): string {
  const cfg = getLLMModel(modelNameOrId);
  return cfg?.requestAuth || defaultApiKey;
}
