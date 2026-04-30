/**
 * 环境变量加载与校验
 *
 * 使用 dotenv 加载 .env 文件，zod 做类型转换和校验。
 */
import dotenv from 'dotenv';
import { z } from 'zod';

// 匹配 Bun 的 .env 加载顺序：.env.{NODE_ENV}.local > .env.local > .env.{NODE_ENV} > .env
// dotenv 数组优先级：先出现者优先（不被后续覆盖），与 Bun 的 override 语义一致。
// quiet:true 抑制 dotenv 17.x 默认向 stdout 打印的注入横幅，
// 避免被 worker 子进程透传到 IPC 首行导致 base-process-pool 解析 init 响应失败。
const nodeEnv = process.env.NODE_ENV;
const envFiles = [
  nodeEnv ? `.env.${nodeEnv}.local` : null,
  '.env.local',
  nodeEnv ? `.env.${nodeEnv}` : null,
  '.env'
].filter((f): f is string => Boolean(f));
dotenv.config({ path: envFiles, quiet: true });

/** coerce 数字，带默认值 */
const int = (defaultValue: number) => z.coerce.number().int().default(defaultValue);

/** 字符串，带默认值 */
const str = (defaultValue: string) => z.string().default(defaultValue);
const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);

const envSchema = z.object({
  // ===== 服务 =====
  SANDBOX_PORT: int(3000),
  /** Bearer token，仅允许 ASCII 可打印字符（RFC 6750） */
  SANDBOX_TOKEN: z
    .string()
    .default('')
    .refine((v) => v === '' || /^[\x21-\x7E]+$/.test(v), {
      message:
        'SANDBOX_TOKEN contains invalid characters. Only ASCII printable characters (no spaces) are allowed.'
    }),

  // ===== 进程池 =====
  /** 进程池大小（预热 worker 数量） */
  SANDBOX_POOL_SIZE: int(20).pipe(z.number().min(1).max(100)),

  // ===== 资源限制 =====
  SANDBOX_MAX_TIMEOUT: int(60000).pipe(z.number().min(1000).max(600000)),
  SANDBOX_MAX_MEMORY_MB: int(256).pipe(z.number().min(32).max(4096)),

  // ===== 网络请求限制 =====
  CHECK_INTERNAL_IP: z.coerce.boolean().default(false),
  SANDBOX_REQUEST_MAX_COUNT: int(30).pipe(z.number().min(1).max(1000)),
  SANDBOX_REQUEST_TIMEOUT: int(60000).pipe(z.number().min(1000).max(300000)),
  SANDBOX_REQUEST_MAX_RESPONSE_MB: int(10).pipe(z.number().min(1).max(100)),
  SANDBOX_REQUEST_MAX_BODY_MB: int(5).pipe(z.number().min(1).max(100)),

  // ===== 模块控制 =====
  /** JS 可用模块白名单，逗号分隔 */
  SANDBOX_JS_ALLOWED_MODULES: str('lodash,dayjs,moment,uuid,crypto-js,qs,url,querystring'),
  /** Python 可用模块白名单，逗号分隔 */
  SANDBOX_PYTHON_ALLOWED_MODULES: str(
    'math,cmath,decimal,fractions,random,statistics,' +
      'collections,array,heapq,bisect,queue,copy,' +
      'itertools,functools,operator,' +
      'string,re,difflib,textwrap,unicodedata,codecs,' +
      'datetime,time,calendar,_strptime,' +
      'json,csv,base64,binascii,struct,' +
      'hashlib,hmac,secrets,uuid,' +
      'typing,abc,enum,dataclasses,contextlib,' +
      'pprint,' +
      'numpy,pandas,matplotlib'
  )
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

  // 资源限制
  maxTimeoutMs: e.SANDBOX_MAX_TIMEOUT,
  maxMemoryMB: e.SANDBOX_MAX_MEMORY_MB,
  /** 运行时内存开销（运行时 + 沙箱代码） */
  RUNTIME_MEMORY_OVERHEAD_MB: 50,

  // 进程池
  poolSize: e.SANDBOX_POOL_SIZE,

  // 网络请求限制
  checkInternalIp: e.CHECK_INTERNAL_IP,
  maxRequests: e.SANDBOX_REQUEST_MAX_COUNT,
  requestTimeoutMs: e.SANDBOX_REQUEST_TIMEOUT,
  maxResponseSize: e.SANDBOX_REQUEST_MAX_RESPONSE_MB,
  maxRequestBodySize: e.SANDBOX_REQUEST_MAX_BODY_MB,

  // 模块控制
  jsAllowedModules: e.SANDBOX_JS_ALLOWED_MODULES.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  pythonAllowedModules: e.SANDBOX_PYTHON_ALLOWED_MODULES.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
} as const;

export type Env = typeof env;
