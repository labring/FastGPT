import type { RedisOptions } from 'ioredis';

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

const parseRedisDb = (pathname: string) => {
  const dbPath = pathname.replace(/^\//, '');
  if (!dbPath) return;

  if (!/^\d+$/.test(dbPath)) {
    throw new RedisConfigurationError('REDIS_URL database must be a non-negative integer');
  }

  const db = Number(dbPath);
  if (!Number.isSafeInteger(db)) {
    throw new RedisConfigurationError('REDIS_URL database is outside the supported integer range');
  }

  return db;
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
  const redisUrl = input.trim();
  if (!redisUrl) {
    throw new RedisConfigurationError('REDIS_URL must not be empty');
  }

  if (redisUrl.includes('?') || redisUrl.includes('#')) {
    throw new RedisConfigurationError('REDIS_URL query parameters and fragments are not supported');
  }

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

  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== 'redis:' && protocol !== 'rediss:') {
    throw new RedisConfigurationError('REDIS_URL protocol must be redis or rediss');
  }
  if (!parsedUrl.hostname) {
    throw new RedisConfigurationError('REDIS_URL host must not be empty');
  }
  const db = parseRedisDb(parsedUrl.pathname);
  const port = parsedUrl.port ? Number(parsedUrl.port) : 6379;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new RedisConfigurationError('REDIS_URL port must be between 1 and 65535');
  }
  const tls = protocol === 'rediss:';
  const host = parsedUrl.hostname.replace(/^\[|\]$/g, '');
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
