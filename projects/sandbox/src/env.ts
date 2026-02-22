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
  /** Bearer token，仅允许 ASCII 可打印字符（RFC 6750） */
  SANDBOX_TOKEN: z.string().default('').refine(
    (v) => v === '' || /^[\x21-\x7E]+$/.test(v),
    { message: 'SANDBOX_TOKEN contains invalid characters. Only ASCII printable characters (no spaces) are allowed.' }
  ),
  LOG_LEVEL: str('info'),

  // ===== 资源限制 =====
  SANDBOX_TIMEOUT: int(10000),
  SANDBOX_MAX_TIMEOUT: int(60000),
  SANDBOX_MEMORY_MB: int(64),
  SANDBOX_MAX_MEMORY_MB: int(256),

  // ===== 并发控制 =====
  SANDBOX_MAX_CONCURRENCY: int(50),

  // ===== 进程池 =====
  /** 进程池大小（预热 worker 数量） */
  SANDBOX_POOL_SIZE: int(20),

  // ===== 网络请求限制 =====
  SANDBOX_MAX_REQUESTS: int(30),
  SANDBOX_REQUEST_TIMEOUT: int(10000),
  SANDBOX_MAX_RESPONSE_SIZE: int(2 * 1024 * 1024),

  // ===== 模块控制 =====
  /** JS 可用模块白名单，逗号分隔 */
  SANDBOX_JS_ALLOWED_MODULES: str('lodash,dayjs,moment,uuid,crypto-js,qs,url,querystring'),
  /** Python 危险模块黑名单，逗号分隔 */
  SANDBOX_PYTHON_BLOCKED_MODULES: str(
    'os,sys,subprocess,shutil,socket,ctypes,multiprocessing,threading,pickle,importlib,' +
    'code,codeop,compile,compileall,signal,resource,gc,inspect,' +
    'tempfile,pathlib,io,fileinput,urllib,http,requests,httpx,aiohttp'
  ),
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

  // 并发控制
  maxConcurrency: e.SANDBOX_MAX_CONCURRENCY,

  // 进程池
  poolSize: e.SANDBOX_POOL_SIZE,

  // 网络请求限制
  maxRequests: e.SANDBOX_MAX_REQUESTS,
  requestTimeoutMs: e.SANDBOX_REQUEST_TIMEOUT,
  maxResponseSize: e.SANDBOX_MAX_RESPONSE_SIZE,

  // 模块控制
  jsAllowedModules: e.SANDBOX_JS_ALLOWED_MODULES.split(',').map(s => s.trim()).filter(Boolean),
  pythonBlockedModules: e.SANDBOX_PYTHON_BLOCKED_MODULES.split(',').map(s => s.trim()).filter(Boolean),
} as const;

export type Env = typeof env;
