/**
 * 环境变量加载与类型转换
 *
 * 在应用最早期 import，确保后续模块读到的 process.env 已包含 .env 文件内容。
 * 提供类型安全的读取辅助函数。
 */
import dotenv from 'dotenv';

dotenv.config();

/** 读取字符串，带默认值 */
function str(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/** 读取整数，带默认值 */
function int(key: string, defaultValue: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return defaultValue;
  const n = parseInt(v, 10);
  return isNaN(n) ? defaultValue : n;
}

/** 读取布尔值，带默认值 */
function bool(key: string, defaultValue: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return defaultValue;
  return v === 'true' || v === '1';
}

export const env = {
  // ===== 服务 =====
  port: int('SANDBOX_PORT', 3000),
  token: str('SANDBOX_TOKEN', ''),
  logLevel: str('LOG_LEVEL', 'info'),

  // ===== 资源限制 =====
  defaultTimeoutMs: int('SANDBOX_TIMEOUT', 10000),
  maxTimeoutMs: int('SANDBOX_MAX_TIMEOUT', 60000),
  defaultMemoryMB: int('SANDBOX_MEMORY_MB', 64),
  maxMemoryMB: int('SANDBOX_MAX_MEMORY_MB', 256),
  defaultDiskMB: int('SANDBOX_DISK_MB', 10),
  maxDiskMB: int('SANDBOX_MAX_DISK_MB', 100),

  // ===== 网络请求限制 =====
  maxRequests: int('SANDBOX_MAX_REQUESTS', 30),
  requestTimeoutMs: int('SANDBOX_REQUEST_TIMEOUT', 10000),
  maxResponseSize: int('SANDBOX_MAX_RESPONSE_SIZE', 2 * 1024 * 1024),

  // ===== 进程池 =====
  jsPoolSize: int('SANDBOX_JS_POOL_SIZE', 0),
  pythonPoolSize: int('SANDBOX_PYTHON_POOL_SIZE', 0),
  poolMaxIdleMs: int('SANDBOX_POOL_MAX_IDLE_MS', 300000),
  poolMaxRecycle: int('SANDBOX_POOL_RECYCLE', 50),
} as const;

export type Env = typeof env;
