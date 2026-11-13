import { z } from 'zod';

/**
 * 将环境变量中的空白字符串归一为 `undefined`，避免 `z.coerce.number('')` 静默转换成 `0`。
 */
const emptyTrimmedToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? undefined : val), schema);

/**
 * 校验并归一化主站内部回调基地址：
 * - 仅允许 `http:` 或 `https:` 协议；
 * - 剥离多余的 query、hash 与末尾斜杠，保证拼接 `/api/core/ai/sandbox/*` 时路径确定唯一。
 */
const FastgptAppUrlSchema = z
  .string()
  .trim()
  .min(1, 'FASTGPT_APP_URL environment variable is required')
  .transform((rawUrl, ctx) => {
    const parsed = (() => {
      try {
        return new URL(rawUrl);
      } catch {
        return null;
      }
    })();

    if (!parsed) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid FASTGPT_APP_URL: ${rawUrl}`
      });
      return z.NEVER;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({
        code: 'custom',
        message: `FASTGPT_APP_URL must start with http:// or https://: ${rawUrl}`
      });
      return z.NEVER;
    }

    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  });

/**
 * 构建 `opensandbox-proxy` 环境变量校验 Schema。
 *
 * 设计约束：
 * - `PORT` 默认 `1006`；生产环境要求 `1..65535`，单测可通过 `allowZeroPort: true` 传入 `0` 由内核分配临时端口；
 * - `PREVIEW_PORT` 为可选双端口隔离配置，若设置则不得与 `PORT` 冲突（两者同为 `0` 临时端口除外）；
 * - `AGENT_SANDBOX_PROXY_SECRET` 与 `FASTGPT_APP_URL` 必填，缺失时立即拒绝启动，禁止使用空密钥或回退默认值。
 */
export function createProxyEnvSchema(options: { allowZeroPort?: boolean } = {}) {
  const minPort = options.allowZeroPort === true ? 0 : 1;
  const portSchema = z.coerce.number().int().min(minPort).max(65535);
  const positiveIntSchema = z.coerce.number().int().positive();

  return z
    .object({
      PORT: emptyTrimmedToUndefined(portSchema.default(1006)),
      PREVIEW_PORT: emptyTrimmedToUndefined(portSchema.optional()),
      AGENT_SANDBOX_PROXY_SECRET: z
        .string()
        .trim()
        .min(1, 'AGENT_SANDBOX_PROXY_SECRET environment variable is required'),
      FASTGPT_APP_URL: FastgptAppUrlSchema,
      AGENT_SANDBOX_PROXY_REWRITE_HOST: emptyTrimmedToUndefined(z.string().trim().optional()),
      KEEPALIVE_INTERVAL_MS: emptyTrimmedToUndefined(positiveIntSchema.default(60_000)),
      PREVIEW_CACHE_TTL_MS: emptyTrimmedToUndefined(positiveIntSchema.default(30_000)),
      PREVIEW_CACHE_MAX_ENTRIES: emptyTrimmedToUndefined(positiveIntSchema.default(5_000))
    })
    .superRefine((data, ctx) => {
      if (
        data.PREVIEW_PORT !== undefined &&
        data.PREVIEW_PORT !== 0 &&
        data.PREVIEW_PORT === data.PORT
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['PREVIEW_PORT'],
          message: `PREVIEW_PORT (${data.PREVIEW_PORT}) must differ from PORT (${data.PORT})`
        });
      }
    })
    .transform((data) => ({
      port: data.PORT,
      previewPort: data.PREVIEW_PORT,
      proxySecret: data.AGENT_SANDBOX_PROXY_SECRET,
      fastgptAppUrl: data.FASTGPT_APP_URL,
      rewriteHost: data.AGENT_SANDBOX_PROXY_REWRITE_HOST,
      keepaliveIntervalMs: data.KEEPALIVE_INTERVAL_MS,
      previewCacheTtlMs: data.PREVIEW_CACHE_TTL_MS,
      previewCacheMaxEntries: data.PREVIEW_CACHE_MAX_ENTRIES
    }));
}

export type ProxyConfig = z.infer<ReturnType<typeof createProxyEnvSchema>>;

/**
 * 解析并强校验 `opensandbox-proxy` 启动环境变量；校验失败时抛出包含字段路径与具体原因的异常。
 */
export function parseProxyEnv(
  rawEnv: Record<string, string | undefined> = process.env,
  options: { allowZeroPort?: boolean } = {}
): ProxyConfig {
  const result = createProxyEnvSchema(options).safeParse(rawEnv);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const field = issue.path.join('.');
        return field ? `${field}: ${issue.message}` : issue.message;
      })
      .join('; ');
    throw new Error(`[opensandbox-proxy] Invalid environment variables: ${details}`);
  }
  return result.data;
}
