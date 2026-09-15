import { AsyncLocalStorage } from 'node:async_hooks';
import { trace, type AttributeValue } from '@opentelemetry/api';
import { addSpanProcessor, type SpanProcessor } from '@fastgpt-sdk/otel/tracing';
import type { LangfuseConfigType } from '@fastgpt/global/common/system/types';
import { serviceEnv } from '../../env';

type RuntimeConfig = { secretKey: string; publicKey: string; baseUrl?: string };
let current: SpanProcessor | null = null;
let hash = '';
let pending: Promise<void> | null = null;
const initialAttributesStorage = new AsyncLocalStorage<{
  attributes: Record<string, AttributeValue>;
  consumed: boolean;
}>();
const spanAttributes = new Map<string, Record<string, AttributeValue>>();

type ProcessorSpan = Parameters<SpanProcessor['onStart']>[0];
type ProcessorReadableSpan = Parameters<SpanProcessor['onEnd']>[0];

/** 为 Langfuse processor 创建私有属性视图，不修改其他 OTEL processor 读取的原始 span。 */
const createLangfuseSpanView = <T extends ProcessorSpan | ProcessorReadableSpan>(
  span: T,
  attributes: Record<string, AttributeValue>
): T =>
  new Proxy(span, {
    get(target, property) {
      if (property === 'attributes') {
        return { ...target.attributes, ...attributes };
      }
      if (property === 'setAttribute') {
        return (key: string, value: AttributeValue) => {
          attributes[key] = value;
          return span;
        };
      }
      if (property === 'setAttributes') {
        return (values: Record<string, AttributeValue | undefined>) => {
          Object.entries(values).forEach(([key, value]) => {
            if (value !== undefined) attributes[key] = value;
          });
          return span;
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

const facade: SpanProcessor = {
  onStart(span, parentContext) {
    const pendingSpan = initialAttributesStorage.getStore();
    if (!current || !pendingSpan || pendingSpan.consumed) return;

    pendingSpan.consumed = true;
    const privateAttributes = { ...pendingSpan.attributes };
    spanAttributes.set(span.spanContext().spanId, privateAttributes);
    current.onStart(createLangfuseSpanView(span, privateAttributes), parentContext);
  },
  onEnd(span) {
    const privateAttributes = spanAttributes.get(span.spanContext().spanId);
    if (!current || !privateAttributes) return;

    spanAttributes.delete(span.spanContext().spanId);
    current.onEnd(createLangfuseSpanView(span, privateAttributes));
  },
  forceFlush() {
    return current?.forceFlush() ?? Promise.resolve();
  },
  async shutdown() {
    const processor = current;
    current = null;
    hash = '';
    spanAttributes.clear();
    await processor?.shutdown();
  }
};

/** 标记当前同步调用链中紧接着创建的 span，仅向 Langfuse processor 暴露这些属性。 */
export const prepareLangfuseSpan = (attributes?: Record<string, AttributeValue>) => {
  initialAttributesStorage.enterWith({
    attributes: attributes ?? {},
    consumed: !attributes
  });
};

/** 更新当前 active span 的 Langfuse 私有属性，不写入通用 OTEL span。 */
export const setActiveLangfuseAttributes = (attributes: Record<string, AttributeValue>) => {
  const spanId = trace.getActiveSpan()?.spanContext().spanId;
  if (!spanId) return;

  Object.assign(spanAttributes.get(spanId) ?? {}, attributes);
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
