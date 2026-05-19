import { addSpanProcessor } from '@fastgpt-sdk/otel/tracing';
import { env } from '../../env';

export function isLangfuseEnabled(): boolean {
  return !!(env.LANGFUSE_SECRET_KEY && env.LANGFUSE_PUBLIC_KEY);
}

export async function initLangfuseTracing(): Promise<void> {
  if (!isLangfuseEnabled()) return;

  const { LangfuseSpanProcessor } = await import('@langfuse/otel');

  addSpanProcessor(
    new LangfuseSpanProcessor({
      secretKey: env.LANGFUSE_SECRET_KEY!,
      publicKey: env.LANGFUSE_PUBLIC_KEY!,
      ...(env.LANGFUSE_BASE_URL ? { baseUrl: env.LANGFUSE_BASE_URL } : {}),
      shouldExportSpan: ({ otelSpan }) => {
        return Object.keys(otelSpan.attributes).some((key) => key.startsWith('langfuse.'));
      }
    })
  );
}
