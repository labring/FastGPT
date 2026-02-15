/**
 * 环境变量加载与校验
 *
 * 使用 dotenv 加载 .env 文件，zod 做类型转换和校验。
 */
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/** coerce 数字，带默认值 */
const int = (defaultValue: number) =>
  z.coerce.number().int().default(defaultValue);

/** 字符串，带默认值 */
const str = (defaultValue: string) => z.string().default(defaultValue);

const envSchema = z.object({
  // ===== 服务 =====
  SANDBOX_PORT: int(3000),
  SANDBOX_TOKEN: str(''),
  LOG_LEVEL: str('info'),

  // ===== 资源限制 =====
  SANDBOX_TIMEOUT: int(10000),
  SANDBOX_MAX_TIMEOUT: int(60000),
  SANDBOX_MEMORY_MB: int(64),
  SANDBOX_MAX_MEMORY_MB: int(256),
  SANDBOX_DISK_MB: int(10),
  SANDBOX_MAX_DISK_MB: int(100),

  // ===== 网络请求限制 =====
  SANDBOX_MAX_REQUESTS: int(30),
  SANDBOX_REQUEST_TIMEOUT: int(10000),
  SANDBOX_MAX_RESPONSE_SIZE: int(2 * 1024 * 1024),

  // ===== 进程池 =====
  SANDBOX_JS_POOL_SIZE: int(0),
  SANDBOX_PYTHON_POOL_SIZE: int(0),
  SANDBOX_POOL_MAX_IDLE_MS: int(300000),
  SANDBOX_POOL_RECYCLE: int(50),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

const e = parsed.data;

/** 类型安全的配置对象，字段名与代码风格一致 */
export const env = {
  // 服务
  port: e.SANDBOX_PORT,
  token: e.SANDBOX_TOKEN,
  logLevel: e.LOG_LEVEL,

  // 资源限制
  defaultTimeoutMs: e.SANDBOX_TIMEOUT,
  maxTimeoutMs: e.SANDBOX_MAX_TIMEOUT,
  defaultMemoryMB: e.SANDBOX_MEMORY_MB,
  maxMemoryMB: e.SANDBOX_MAX_MEMORY_MB,
  defaultDiskMB: e.SANDBOX_DISK_MB,
  maxDiskMB: e.SANDBOX_MAX_DISK_MB,

  // 网络请求限制
  maxRequests: e.SANDBOX_MAX_REQUESTS,
  requestTimeoutMs: e.SANDBOX_REQUEST_TIMEOUT,
  maxResponseSize: e.SANDBOX_MAX_RESPONSE_SIZE,

  // 进程池
  jsPoolSize: e.SANDBOX_JS_POOL_SIZE,
  pythonPoolSize: e.SANDBOX_PYTHON_POOL_SIZE,
  poolMaxIdleMs: e.SANDBOX_POOL_MAX_IDLE_MS,
  poolMaxRecycle: e.SANDBOX_POOL_RECYCLE,
} as const;

export type Env = typeof env;
