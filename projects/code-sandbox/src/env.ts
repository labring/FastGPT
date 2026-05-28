/**
 * 环境变量加载与校验
 *
 * 使用 dotenv 加载 .env 文件，@t3-oss/env-core 做类型转换和校验。
 */
import dotenv from 'dotenv';
import { createEnv } from '@t3-oss/env-core';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
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

const parseAllowedModules = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const RUNTIME_MEMORY_OVERHEAD_MB = 50;

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  // ===== 服务 =====
  server: {
    SANDBOX_PORT: IntSchema.default(3000),
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
    SANDBOX_POOL_SIZE: IntSchema.min(1).max(100).default(20),
    /** 同一 queueId 同时可进入执行流程的请求数；为空时不启用 queueId 排队 */
    SANDBOX_QUEUE_ID_CONCURRENCY: IntSchema.min(1).max(100).optional(),

    // ===== 资源限制 =====
    SANDBOX_API_MAX_BODY_MB: IntSchema.min(1).max(100).default(8),
    SANDBOX_MAX_TIMEOUT: IntSchema.min(1000).max(600000).default(60000),
    SANDBOX_MAX_MEMORY_MB: IntSchema.min(32).max(4096).default(256),
    SANDBOX_MAX_OUTPUT_MB: IntSchema.min(1).max(100).default(10),

    // ===== 网络请求限制 =====
    CHECK_INTERNAL_IP: BoolSchema.default(true),
    SANDBOX_REQUEST_MAX_COUNT: IntSchema.min(1).max(1000).default(30),
    SANDBOX_REQUEST_TIMEOUT: IntSchema.min(1000).max(300000).default(60000),
    SANDBOX_REQUEST_MAX_RESPONSE_MB: IntSchema.min(1).max(100).default(10),
    SANDBOX_REQUEST_MAX_BODY_MB: IntSchema.min(1).max(100).default(5),

    // ===== 模块控制 =====
    /** JS 可用模块白名单，逗号分隔 */
    SANDBOX_JS_ALLOWED_MODULES: z
      .string()
      .default('lodash,dayjs,moment,uuid,crypto-js,qs,url,querystring')
      .transform(parseAllowedModules),
    /** Python 可用模块白名单，逗号分隔 */
    SANDBOX_PYTHON_ALLOWED_MODULES: z
      .string()
      .default(
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
      .transform(parseAllowedModules)
  }
});

export type Env = typeof env;
