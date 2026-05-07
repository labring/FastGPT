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
  /** host:port forms the proxy considers "base"; sandbox lives at <sid>.<base>. */
  SANDBOX_PROXY_BASE: z.string().min(1),
  SANDBOX_PROXY_SECRET: z.string().min(16, 'SANDBOX_PROXY_SECRET must be at least 16 chars'),
  SANDBOX_PROXY_TOKEN_TTL: z.coerce.number().int().positive().default(3600),
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

const baseHosts = parsed.data.SANDBOX_PROXY_BASE.split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (baseHosts.length === 0) {
  console.error('SANDBOX_PROXY_BASE must contain at least one host[:port]');
  process.exit(1);
}

export const env = {
  port: parsed.data.SANDBOX_PROXY_PORT,
  baseHosts,
  secret: parsed.data.SANDBOX_PROXY_SECRET,
  tokenTtlSeconds: parsed.data.SANDBOX_PROXY_TOKEN_TTL,
  csLoginBackoffMs: parsed.data.SANDBOX_PROXY_CS_LOGIN_BACKOFF_MS,
  appBaseUrl: parsed.data.SANDBOX_PROXY_APP_BASE_URL.replace(/\/+$/, ''),
  logLevel: parsed.data.LOG_LEVEL,
  dev: process.env.NODE_ENV !== 'production'
} as const;
