import { addSpanProcessor, type SpanProcessor } from '@fastgpt-sdk/otel/tracing';
import type { LangfuseConfigType } from '@fastgpt/global/common/system/types';
import { env } from '../../env';
import { getLogger, LogCategories } from '../logger';

type LangfuseRuntimeConfig = {
  secretKey: string;
  publicKey: string;
  baseUrl?: string;
};

const logger = getLogger(LogCategories.INFRA.OTEL);

let registered = false;
let currentProcessor: SpanProcessor | null = null;
let currentConfigHash = '';
let refreshPromise: Promise<void> | null = null;

const langfuseSpanProcessor: SpanProcessor = {
  onStart(...args): void {
    const [span, parentContext] = args;
    currentProcessor?.onStart(span, parentContext);
  },
  onEnd(span): void {
    currentProcessor?.onEnd(span);
  },
  forceFlush(): Promise<void> {
    return currentProcessor?.forceFlush() ?? Promise.resolve();
  },
  shutdown(): Promise<void> {
    return currentProcessor?.shutdown() ?? Promise.resolve();
  }
};

function normalizeConfigValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function getSystemLangfuseConfig(): LangfuseConfigType | undefined {
  return global.systemEnv?.langfuse;
}

function resolveLangfuseConfig(): LangfuseRuntimeConfig | undefined {
  const runtimeConfig = getSystemLangfuseConfig();
  const hasRuntimeConfig = !!(
    normalizeConfigValue(runtimeConfig?.secretKey) ||
    normalizeConfigValue(runtimeConfig?.publicKey) ||
    normalizeConfigValue(runtimeConfig?.baseUrl)
  );

  const secretKey = hasRuntimeConfig
    ? normalizeConfigValue(runtimeConfig?.secretKey)
    : env.LANGFUSE_SECRET_KEY;
  const publicKey = hasRuntimeConfig
    ? normalizeConfigValue(runtimeConfig?.publicKey)
    : env.LANGFUSE_PUBLIC_KEY;
  const baseUrl = hasRuntimeConfig
    ? normalizeConfigValue(runtimeConfig?.baseUrl)
    : env.LANGFUSE_BASE_URL;

  if (!secretKey || !publicKey) return;

  return {
    secretKey,
    publicKey,
    ...(baseUrl ? { baseUrl } : {})
  };
}

function getConfigHash(config?: LangfuseRuntimeConfig) {
  if (!config) return '';

  return JSON.stringify({
    secretKey: config.secretKey,
    publicKey: config.publicKey,
    baseUrl: config.baseUrl || ''
  });
}

function registerLangfuseProcessor() {
  if (registered) return;

  addSpanProcessor(langfuseSpanProcessor);
  registered = true;
}

async function shutdownCurrentProcessor() {
  const processor = currentProcessor;
  currentProcessor = null;

  if (!processor) return;

  try {
    await processor.shutdown();
  } catch (error) {
    logger.error('Langfuse span processor shutdown failed', { error });
  }
}

export function isLangfuseEnabled(): boolean {
  return !!resolveLangfuseConfig();
}

export async function initLangfuseTracing(): Promise<void> {
  registerLangfuseProcessor();
  await refreshLangfuseTracing();
}

export async function refreshLangfuseTracing(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const config = resolveLangfuseConfig();
    const nextConfigHash = getConfigHash(config);

    if (nextConfigHash === currentConfigHash) return;

    await shutdownCurrentProcessor();

    if (!config) {
      currentConfigHash = nextConfigHash;
      logger.info('Langfuse tracing disabled');
      return;
    }

    const { LangfuseSpanProcessor } = await import('@langfuse/otel');

    currentProcessor = new LangfuseSpanProcessor({
      secretKey: config.secretKey,
      publicKey: config.publicKey,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      shouldExportSpan: ({ otelSpan }) => {
        return Object.keys(otelSpan.attributes).some((key) => key.startsWith('langfuse.'));
      }
    });
    currentConfigHash = nextConfigHash;

    logger.info('Langfuse tracing enabled', {
      baseUrl: config.baseUrl
    });
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}
