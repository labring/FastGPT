import dotenv from 'dotenv';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV;
const envFiles = [
  nodeEnv ? `.env.${nodeEnv}.local` : null,
  '.env.local',
  nodeEnv ? `.env.${nodeEnv}` : null,
  '.env'
].filter((f): f is string => Boolean(f));
dotenv.config({ path: envFiles, quiet: true });

const envSchema = z.object({
  SANDBOX_PROXY_PORT: z.coerce.number().int().min(1).max(65535).default(3006),
  SANDBOX_PROXY_SECRET: z.string().min(16, 'SANDBOX_PROXY_SECRET must be at least 16 chars'),
  SANDBOX_PROXY_TOKEN_TTL: z.coerce.number().int().positive().default(1800),
  /**
   * Backoff window after transient code-server login failures (milliseconds).
   * Prevents repeated password-fetch + /login retries on every request.
   */
  SANDBOX_PROXY_CS_LOGIN_BACKOFF_MS: z.coerce.number().int().min(1000).default(15000),
  /** Where the FastGPT app is reachable for internal callbacks (cs-password fetch). */
  SANDBOX_PROXY_APP_BASE_URL: z.url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warning', 'error']).default('info')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = {
  port: parsed.data.SANDBOX_PROXY_PORT,
  secret: parsed.data.SANDBOX_PROXY_SECRET,
  tokenTtlSeconds: parsed.data.SANDBOX_PROXY_TOKEN_TTL,
  csLoginBackoffMs: parsed.data.SANDBOX_PROXY_CS_LOGIN_BACKOFF_MS,
  appBaseUrl: parsed.data.SANDBOX_PROXY_APP_BASE_URL.replace(/\/+$/, ''),
  logLevel: parsed.data.LOG_LEVEL,
  dev: process.env.NODE_ENV !== 'production'
} as const;
