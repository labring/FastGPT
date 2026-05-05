import { createEnv } from '@t3-oss/env-core';
import z from 'zod';
import { isPhaseProductionBuild } from '@fastgpt/global/common/system/constants';
import { BoolSchema, IntSchema, NumSchema, UrlSchema } from '@fastgpt/global/common/zod';

const defaultableIntSchema = (defaultValue: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? defaultValue : value),
    z.coerce.number<number>().int().nonnegative()
  );

/**
 * 判断系统是否显式配置了 Agent 虚拟机能力。
 * 注意 serviceEnv 会给部分字段填默认值，这里必须读取原始 env，避免把未配置误判为已配置。
 */
export const hasAgentSandboxConfig = () => {
  const provider = process.env.AGENT_SANDBOX_PROVIDER;

  if (provider === 'sealosdevbox') {
    return !!(process.env.AGENT_SANDBOX_SEALOS_BASEURL && process.env.AGENT_SANDBOX_SEALOS_TOKEN);
  }

  if (provider === 'opensandbox') {
    return !!(
      process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL && process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY
    );
  }

  return false;
};

// 枚举
const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);
const StorageVendorSchema = z.enum(['minio', 'aws-s3', 'cos', 'oss']);
const StorageCosProtocolSchema = z.enum(['https:', 'http:']);

export const serviceEnv = createEnv({
  skipValidation: isPhaseProductionBuild,
  server: {
    // ==================== 基础配置 ====================
    DB_MAX_LINK: IntSchema.min(1).default(5),
    SYNC_INDEX: BoolSchema.default(true),

    // ==================== 密钥 ====================
    TOKEN_KEY: z
      .string()
      .min(6, 'TOKEN_KEY must be at least 6 characters')
      .default('fastgpt_token_key'),
    FILE_TOKEN_KEY: z.string().min(6, 'FILE_TOKEN_KEY must be at least 6 characters'),
    AES256_SECRET_KEY: z.string().min(6, 'AES256_SECRET_KEY must be at least 6 characters'),
    ROOT_KEY: z
      .string()
      .min(6, 'ROOT_KEY must be at least 6 characters')
      .default('fastgpt_root_key'),

    // ==================== 服务地址与集成 ====================
    // 插件
    PLUGIN_BASE_URL: UrlSchema.default('http://localhost:3004'),
    PLUGIN_TOKEN: z.string().default('token'),
    PLUGIN_ACCESS_TOKEN_SECRET: z.string().default('plugin_access_token_secret'),
    PLUGIN_ACCESS_TOKEN_EXPIRES_IN: IntSchema.default(3600).meta({
      description: '过期时间，单位: 秒'
    }),

    // 代码沙箱
    CODE_SANDBOX_URL: UrlSchema.default('http://localhost:3002'),
    CODE_SANDBOX_TOKEN: z.string().default('codesandbox'),

    // AI Proxy
    AIPROXY_API_ENDPOINT: UrlSchema.optional(),
    AIPROXY_API_TOKEN: z.string().optional(),
    OPENAI_BASE_URL: UrlSchema.default('https://api.openai.com/v1'),
    CHAT_API_KEY: z.string().optional(),

    PRO_URL: UrlSchema.optional(),

    // Agent sandbox
    AGENT_SANDBOX_PROVIDER: z.enum(['sealosdevbox', 'opensandbox', 'e2b']).default('opensandbox'),
    // E2B配置
    AGENT_SANDBOX_E2B_API_KEY: z.string().optional(),
    // Sealos配置
    AGENT_SANDBOX_SEALOS_BASEURL: UrlSchema.optional(),
    AGENT_SANDBOX_SEALOS_TOKEN: z.string().optional(),
    AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: z.string().default('/home/devbox/workspace'),
    // OpenSandbox配置
    AGENT_SANDBOX_OPENSANDBOX_BASEURL: UrlSchema.optional(),
    AGENT_SANDBOX_OPENSANDBOX_API_KEY: z.string().optional(),
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: z.enum(['docker', 'kubernetes']).default('docker'),
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: z.string().default('fastgpt-agent-sandbox'),
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: z.string().default('latest'),
    AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: BoolSchema.default(true),
    AGENT_SANDBOX_ENABLE_VOLUME: BoolSchema.default(false),
    AGENT_SANDBOX_VOLUME_MANAGER_URL: UrlSchema.default('http://localhost:3005'),
    AGENT_SANDBOX_VOLUME_MANAGER_TOKEN: z.string().optional(),

    // Skill 配置
    AGENT_SKILL_MAX_UPLOAD_SIZE: NumSchema.default(50).meta({
      description: 'Skill 包大小上限（MB），用于上传、解压、下载和 sandbox 打包校验'
    }),
    AGENT_SANDBOX_MAX_EDIT_DEBUG: NumSchema.default(100),
    AGENT_SANDBOX_MAX_SESSION_RUNTIME: NumSchema.default(300),

    // ==================== 数据库与缓存 ====================
    // Redisg
    REDIS_URL: z.string().default('redis://default:mypassword@localhost:6379'),
    STREAM_RESUME_TTL_SECONDS: IntSchema.default(5 * 60).meta({
      description: 'Redis 流式镜像续期：生成中（秒）'
    }),
    STREAM_RESUME_POST_COMPLETE_TTL_SECONDS: IntSchema.default(30).meta({
      description: '流结束后缩短 TTL，便于回收（秒）'
    }),
    STREAM_RESUME_REDIS_MAXMEMORY_RATIO: NumSchema.max(1).default(0.5).meta({
      description: '当 Redis 已用内存 / maxmemory 达到该阈值时，停止为新请求创建流恢复镜像'
    }),
    STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS: IntSchema.default(5000).meta({
      description: 'Redis 内存水位检测缓存时长（毫秒），避免每个流请求都调用 INFO MEMORY'
    }),

    // Mongo
    MONGODB_URI: z
      .string()
      .default(
        'mongodb://myusername:mypassword@localhost:27017/fastgpt?authSource=admin&directConnection=true'
      ),
    MONGODB_LOG_URI: z.string().optional(),

    // VectorDB
    VECTOR_VQ_LEVEL: IntSchema.default(32).meta({
      description: '向量量化等级'
    }),
    PG_URL: z.string().optional().meta({ description: 'PG 向量库连接参数' }),
    OCEANBASE_URL: z.string().optional().meta({ description: 'OceanBase 向量库连接参数' }),
    SEEKDB_URL: z.string().optional().meta({ description: 'SeekDB 向量库连接参数' }),
    MILVUS_ADDRESS: z.string().optional().meta({ description: 'Milvus 向量库连接参数' }),
    MILVUS_TOKEN: z.string().optional().meta({ description: 'Milvus 向量库Token' }),
    OPENGAUSS_URL: z.string().optional().meta({ description: 'openGauss 向量库连接参数' }),

    // 对象存储
    STORAGE_VENDOR: StorageVendorSchema.default('minio'),
    STORAGE_PUBLIC_BUCKET: z.string().default('fastgpt-public'),
    STORAGE_PRIVATE_BUCKET: z.string().default('fastgpt-private'),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_EXTERNAL_ENDPOINT: UrlSchema.optional(),
    STORAGE_S3_CDN_ENDPOINT: UrlSchema.optional(),
    STORAGE_S3_ENDPOINT: UrlSchema.default('http://localhost:9000'),
    STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH: z.string().optional(),
    STORAGE_ACCESS_KEY_ID: z.string().default('minioadmin'),
    STORAGE_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
    STORAGE_S3_FORCE_PATH_STYLE: BoolSchema.default(false),
    STORAGE_S3_MAX_RETRIES: IntSchema.default(3),
    STORAGE_COS_PROTOCOL: StorageCosProtocolSchema.default('https:'),
    STORAGE_COS_USE_ACCELERATE: BoolSchema.default(false),
    STORAGE_COS_CNAME_DOMAIN: z.string().optional(),
    STORAGE_COS_PROXY: z.string().optional(),
    STORAGE_OSS_ENDPOINT: UrlSchema.optional(),
    STORAGE_OSS_CNAME: BoolSchema.default(false),
    STORAGE_OSS_INTERNAL: BoolSchema.default(false),
    STORAGE_OSS_SECURE: BoolSchema.default(false),
    STORAGE_OSS_ENABLE_PROXY: BoolSchema.default(true),

    //  ==================== 日志配置 ====================
    LOG_ENABLE_CONSOLE: BoolSchema.default(true),
    LOG_CONSOLE_LEVEL: LogLevelSchema.default('debug'),
    LOG_ENABLE_OTEL: BoolSchema.default(false),
    LOG_OTEL_LEVEL: LogLevelSchema.default('info'),
    LOG_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    LOG_OTEL_URL: UrlSchema.optional(),
    // 指标
    METRICS_ENABLE_OTEL: BoolSchema.default(false),
    METRICS_EXPORT_INTERVAL: NumSchema.int().positive().default(30000),
    METRICS_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    METRICS_OTEL_URL: UrlSchema.optional(),
    // 追踪
    TRACING_ENABLE_OTEL: BoolSchema.default(false),
    TRACING_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    TRACING_OTEL_URL: UrlSchema.optional(),
    TRACING_OTEL_SAMPLE_RATIO: NumSchema.min(0).max(1).optional(),

    // ==================== 域名与前端 ====================
    FE_DOMAIN: UrlSchema.optional().meta({
      description:
        '前端外部可访问的地址，用于自动补全文件资源路径。例如 https:fastgpt.cn，不能填 localhost。这个值可以不填，不填则发给模型的图片会是一个相对路径，而不是全路径，模型可能伪造Host。'
    }),
    FILE_DOMAIN: UrlSchema.optional().meta({
      description:
        '文件域名（也指向 FastGPT 服务）；如需更高安全性可独立分配域名，避免高危文件读取到主域名内容'
    }),
    NEXT_PUBLIC_BASE_URL: z.string().default(''),

    //==================== 安全配置 ====================
    USE_IP_LIMIT: BoolSchema.default(false).meta({ description: '是否启用 IP 限流' }),
    CHECK_INTERNAL_IP: BoolSchema.default(false).meta({ description: '是否启用内网 IP 检查' }),
    TRUSTED_PROXY_ENABLE: BoolSchema.default(false).meta({
      description:
        '是否启用可信反向代理客户端 IP 校验；关闭时兼容旧逻辑，直接信任 X-Forwarded-For/X-Real-IP'
    }),
    TRUSTED_PROXY_IPS: z.string().optional().meta({
      description:
        '可信反向代理 IP/CIDR 列表，逗号或空白分隔。仅 TRUSTED_PROXY_ENABLE=true 时生效；仅显式可信代理传入的 X-Forwarded-For/X-Real-IP 会用于客户端 IP 解析'
    }),
    PASSWORD_LOGIN_LOCK_SECONDS: defaultableIntSchema(120).meta({
      description: '密码错误锁定时长（秒）'
    }),
    MAX_LOGIN_SESSION: IntSchema.default(10).meta({ description: '最大登录客户端数量（默认 10）' }),
    ALLOWED_ORIGINS: z
      .string()
      .optional()
      .meta({ description: '自定义跨域；不配置时默认允许所有跨域（逗号分割）' }),
    MULTIPLE_DATA_TO_BASE64: BoolSchema.default(true).meta({
      description: '是否强制将图片、音频、视频转成 base64 传递给模型'
    }),

    //==================== Beta features ====================
    AGENT_ENGINE: z.enum(['default', 'pi']).default('default').meta({
      description: 'Agent 引擎选择：default（unified agent loop）| pi（pi-agent-core 引擎）'
    }),
    HELPER_BOT_MODEL: z
      .string()
      .optional()
      .meta({ description: '辅助生成模型（暂时只能指定一个，需保证系统中已激活该模型）' }),
    SKIP_FILE_TYPE_CHECK: BoolSchema.default(false).meta({
      description: '是否跳过文件类型检查'
    }),
    DISABLE_CACHE: BoolSchema.default(false).meta({
      description: '是否禁用系统内存缓存'
    }),

    // ==================== 并发控制与限制 ====================
    WECHAT_CHANNEL_CONCURRENCY: IntSchema.min(10).default(1000).meta({
      description: '微信渠道 poll worker 并发数'
    }),
    PARSE_FILE_WORKERS: IntSchema.min(1).max(1000).default(10).meta({
      description: '文件解析 worker 常驻线程数'
    }),
    HTML_TO_MARKDOWN_WORKERS: IntSchema.min(1).max(1000).default(10).meta({
      description: 'HTML 转 Markdown worker 常驻线程数'
    }),
    TEXT_TO_CHUNKS_WORKERS: IntSchema.min(1).max(1000).default(10).meta({
      description: '文本切块 worker 常驻线程数'
    }),
    PARSE_FILE_TIMEOUT_SECONDS: IntSchema.min(60).max(6000).default(600).meta({
      description: '文件解析单任务超时时间（秒）'
    }),
    WORKFLOW_MAX_RUN_TIMES: IntSchema.default(500).meta({
      description: '工作流最大运行次数，避免极端死循环'
    }),
    WORKFLOW_MAX_LOOP_TIMES: IntSchema.default(100).meta({
      description: '循环/并行节点最大输入数组长度（默认 100）'
    }),
    WORKFLOW_PARALLEL_MAX_CONCURRENCY: IntSchema.default(10).meta({
      description: '并行节点并发上限（最终会 clamp 到 [5, 100]，默认 10）'
    }),
    CHAT_MAX_QPM: IntSchema.default(5000).meta({
      description: '聊天 QPM（若用户套餐有限制，这里不生效）'
    }),
    CHAT_LOG_URL: UrlSchema.optional().meta({
      description: '聊天日志推送地址'
    }),
    CHAT_LOG_INTERVAL: IntSchema.optional().meta({
      description: '聊天日志推送延迟时间（毫秒）'
    }),
    CHAT_LOG_SOURCE_ID_PREFIX: z.string().default('fastgpt-'),
    TRACK_BATCH_UPDATE_TIME: IntSchema.default(10000).meta({
      description: '埋点批量写入间隔（毫秒）'
    }),
    EVAL_CONCURRENCY: IntSchema.default(3).meta({
      description: '评估任务 worker 并发数'
    }),
    SANDBOX_PROXY_REPLACE_DOCKER_INTERNAL_WITH_LOCALHOST: BoolSchema.default(false).meta({
      description:
        '是否把 endpoint 中的 host.docker.internal 改写为 localhost；当 sandbox-proxy 直接运行在宿主机进程时开启，容器或 k8s 内运行时保持关闭'
    }),

    // ==================== 资源限制 ====================
    SERVICE_REQUEST_MAX_CONTENT_LENGTH: IntSchema.default(10).meta({
      description: '服务器接收请求的最大大小（MB）'
    }),
    APP_FOLDER_MAX_AMOUNT: IntSchema.default(1000).meta({
      description: '应用文件夹最大数量'
    }),
    DATASET_FOLDER_MAX_AMOUNT: IntSchema.default(1000).meta({
      description: '数据集文件夹最大数量'
    }),
    UPLOAD_FILE_MAX_SIZE: IntSchema.default(1000).meta({
      description: '最大上传文件大小（MB）'
    }),
    UPLOAD_FILE_MAX_AMOUNT: IntSchema.default(1000).meta({
      description: '最大上传文件数量'
    }),
    LLM_REQUEST_TRACKING_RETENTION_HOURS: IntSchema.default(6).meta({
      description: 'LLM 请求追踪保留时长（小时）'
    }),
    MAX_HTML_TRANSFORM_CHARS: IntSchema.default(1000000).meta({
      description: 'HTML 转 Markdown 最大字符数（超过后不执行转换）'
    }),

    // ==================== 第三方数据源 ====================
    FEISHU_BASE_URL: UrlSchema.default('https://open.feishu.cn'),
    DINGTALK_BASE_URL: UrlSchema.default('https://api.dingtalk.com'),
    DINGTALK_OAPI_BASE_URL: UrlSchema.default('https://oapi.dingtalk.com'),
    YUQUE_DATASET_BASE_URL: UrlSchema.default('https://www.yuque.com'),

    // Invoke 反向调用相关
    INVOKE_TOKEN_SECRET: z.string().default('token')
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid environment variables. Please check: ${paths}\n`);
  }
});

if (serviceEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY > serviceEnv.WORKFLOW_MAX_LOOP_TIMES) {
  throw new Error(
    `Invalid environment configuration: WORKFLOW_PARALLEL_MAX_CONCURRENCY (${serviceEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY}) must not exceed WORKFLOW_MAX_LOOP_TIMES (${serviceEnv.WORKFLOW_MAX_LOOP_TIMES})`
  );
}
