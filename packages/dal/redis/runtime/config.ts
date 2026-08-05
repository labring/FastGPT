import type { RedisOptions } from 'ioredis';
import { z } from 'zod';

export type RedisEndpoint = {
  transport: 'tcp' | 'unix';
  host?: string;
  port?: number;
  path?: string;
  db?: number;
  tls: boolean;
  hasUsername: boolean;
  hasPassword: boolean;
};

export type RedisConnectionConfig = {
  options: RedisOptions;
  endpoint: RedisEndpoint;
};

export class RedisConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisConfigurationError';
  }
}

const RedisUrlInputSchema = z
  .string({ error: 'REDIS_URL must be a string' })
  .trim()
  .min(1, { error: 'REDIS_URL must not be empty' })
  .refine((value) => !value.includes('?') && !value.includes('#'), {
    error: 'REDIS_URL query parameters and fragments are not supported'
  });

const RedisDbPathSchema = z
  .string()
  .regex(/^\d+$/, { error: 'REDIS_URL database must be a non-negative integer' })
  .transform(Number)
  .pipe(
    z
      .number({ error: 'REDIS_URL database is outside the supported integer range' })
      .max(Number.MAX_SAFE_INTEGER, {
        error: 'REDIS_URL database is outside the supported integer range'
      })
  );

const RedisTcpUrlSchema = z.object({
  protocol: z.enum(['redis:', 'rediss:'], {
    error: 'REDIS_URL protocol must be redis or rediss'
  }),
  hostname: z.string().min(1, { error: 'REDIS_URL host must not be empty' }),
  port: z
    .number({ error: 'REDIS_URL port must be between 1 and 65535' })
    .int({ error: 'REDIS_URL port must be between 1 and 65535' })
    .min(1, { error: 'REDIS_URL port must be between 1 and 65535' })
    .max(65535, { error: 'REDIS_URL port must be between 1 and 65535' })
});

const parseConfigSchema = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RedisConfigurationError(result.error.issues[0]!.message);
  }
  return result.data;
};

const parseRedisDb = (pathname: string) => {
  const dbPath = pathname.replace(/^\//, '');
  if (!dbPath) return;
  return parseConfigSchema(RedisDbPathSchema, dbPath);
};

const decodeCredential = (value: string, field: 'username' | 'password') => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new RedisConfigurationError(`REDIS_URL ${field} is not valid percent-encoded text`);
  }
};

/**
 * 解析 standalone Redis 连接配置。
 *
 * 兼容现有的无协议地址和 Unix socket，但拒绝未知协议、query/hash 以及非法 db。
 * 抛出的错误不会包含原始 URL，避免账号密码进入启动日志。
 */
export const parseRedisConnectionConfig = (input: string): RedisConnectionConfig => {
  const redisUrl = parseConfigSchema(RedisUrlInputSchema, input);

  if (redisUrl.startsWith('/')) {
    return {
      options: { path: redisUrl },
      endpoint: {
        transport: 'unix',
        path: redisUrl,
        tls: false,
        hasUsername: false,
        hasPassword: false
      }
    };
  }

  const normalizedRedisUrl = redisUrl.includes('://') ? redisUrl : `redis://${redisUrl}`;
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedRedisUrl);
  } catch {
    throw new RedisConfigurationError('REDIS_URL is not a valid Redis connection URL');
  }

  const db = parseRedisDb(parsedUrl.pathname);
  const { protocol, hostname, port } = parseConfigSchema(RedisTcpUrlSchema, {
    protocol: parsedUrl.protocol.toLowerCase(),
    hostname: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 6379
  });
  const tls = protocol === 'rediss:';
  const host = hostname.replace(/^\[|\]$/g, '');
  const options: RedisOptions = {
    host,
    port
  };

  if (parsedUrl.username) {
    options.username = decodeCredential(parsedUrl.username, 'username');
  }
  if (parsedUrl.password) {
    options.password = decodeCredential(parsedUrl.password, 'password');
  }
  if (db !== undefined) {
    options.db = db;
  }
  if (tls) {
    options.tls = {};
  }

  return {
    options,
    endpoint: {
      transport: 'tcp',
      host,
      port,
      db,
      tls,
      hasUsername: parsedUrl.username.length > 0,
      hasPassword: parsedUrl.password.length > 0
    }
  };
};
