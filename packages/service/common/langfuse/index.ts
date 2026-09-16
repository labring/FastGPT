import { addSpanProcessor, type SpanProcessor } from '@fastgpt-sdk/otel/tracing';
import type { LangfuseConfigType } from '@fastgpt/global/common/system/types';
import { serviceEnv } from '../../env';

type RuntimeConfig = { secretKey: string; publicKey: string; baseUrl?: string };
let current: SpanProcessor | null = null;
let hash = '';
let pending: Promise<void> | null = null;

const facade: SpanProcessor = {
  onStart(span, parentContext) {
    current?.onStart(span, parentContext);
  },
  onEnd(span) {
    current?.onEnd(span);
  },
  forceFlush() {
    return current?.forceFlush() ?? Promise.resolve();
  },
  async shutdown() {
    const processor = current;
    current = null;
    hash = '';
    await processor?.shutdown();
  }
};

const value = (v?: string) => v?.trim() || undefined;

function resolve(): RuntimeConfig | undefined {
  const runtime = global.systemEnv?.langfuse as LangfuseConfigType | undefined;
  const hasRuntime = !!(
    value(runtime?.secretKey) ||
    value(runtime?.publicKey) ||
    value(runtime?.baseUrl)
  );
  const secretKey = hasRuntime ? value(runtime?.secretKey) : value(serviceEnv.LANGFUSE_SECRET_KEY);
  const publicKey = hasRuntime ? value(runtime?.publicKey) : value(serviceEnv.LANGFUSE_PUBLIC_KEY);
  const baseUrl = hasRuntime ? value(runtime?.baseUrl) : value(serviceEnv.LANGFUSE_BASE_URL);
  if (!secretKey || !publicKey) return;
  return { secretKey, publicKey, ...(baseUrl ? { baseUrl } : {}) };
}

/** 判断当前运行时是否存在完整的 Langfuse 凭据。 */
export function isLangfuseEnabled() {
  return !!resolve();
}

/** 在 OTel provider 创建前注册可热替换的 Langfuse processor。 */
export async function initLangfuseTracing() {
  addSpanProcessor(facade);
  await refreshLangfuseTracing();
}

/** 根据最新系统配置替换 Langfuse processor，并在切换前刷新旧实例。 */
export async function refreshLangfuseTracing() {
  if (pending) return pending;
  pending = (async () => {
    const config = resolve();
    const nextHash = JSON.stringify(config || null);
    if (nextHash === hash) return;
    const old = current;
    current = null;
    if (old) await old.shutdown().catch(() => undefined);
    if (config) {
      const { LangfuseSpanProcessor } = await import('@langfuse/otel');
      current = new LangfuseSpanProcessor({
        ...config,
        shouldExportSpan: ({ otelSpan }) =>
          Object.keys(otelSpan.attributes).some((k) => k.startsWith('langfuse.'))
      });
    }
    hash = nextHash;
  })();
  try {
    await pending;
  } finally {
    pending = null;
  }
}
