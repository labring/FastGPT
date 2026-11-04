import { createEnv } from '@t3-oss/env-core';
import z from 'zod';
import { isPhaseProductionBuild } from '@fastgpt/global/common/system/constants';
import { BoolSchema, IntSchema, NumSchema, UrlSchema } from '@fastgpt/global/common/zod';
import {
  AgentSandboxPreviewProxyUrlSchema,
  AgentSandboxProxyUrlSchema,
  getRuntimeEnv,
  validateS3Env,
  validateAgentUsersEnv
} from './env.util';
import { LogLevelSchema, StorageVendorSchema, StorageCosProtocolSchema } from './env.const';

export const serviceEnv = createEnv({
  skipValidation: isPhaseProductionBuild,
  server: {
    // ==================== 基础配置 ====================
    AUXILIARY_GENERATION_SHOW_RUN_DETAIL: BoolSchema.default(false).meta({
      description: '是否展示 Skill、Agent 和工作流辅助生成的运行详情入口，默认不展示'
    }),
    DB_MAX_LINK: NumSchema.int()
      .default(10)
      .transform((value) => Math.min(1000, Math.max(10, value))),

    // ==================== 管理端展示控制 ====================
    ENABLE_SAAS_ADMIN_CONFIG: BoolSchema.default(false).meta({
      description: '是否在管理端展示 SaaS 专用配置项，默认为 false（私有化部署隐藏）'
    }),

    // ==================== 密钥 ====================
    ROOT_KEY: z
      .string()
      .min(6, 'ROOT_KEY must be at least 6 characters')
      .default('fastgpt_root_key'),
    FILE_TOKEN_KEY: z.string().min(6, 'FILE_TOKEN_KEY must be at least 6 characters'),
    AES256_SECRET_KEY: z.string().min(6, 'AES256_SECRET_KEY must be at least 6 characters'),

    // Invoke 反向调用相关。该密钥用于签发/校验插件反向调用 JWT，必须显式配置，避免未配置时落到公开默认值。
    INVOKE_TOKEN_SECRET: z.string().min(32, 'INVOKE_TOKEN_SECRET must be at least 32 characters'),

    // ==================== 服务地址与集成 ====================

    PRO_URL: UrlSchema.optional(),
    PRO_TOKEN: z.string().min(32, 'PRO_TOKEN must be at least 32 characters').optional(),
    AGENT_USERS: z.string().optional(),
    DEFAULT_AGENT_PSW: z.string().optional(),

    // 官网访客归因 CRM；未配置地址时不进行身份上报
    CRM_API_URL: UrlSchema.optional(),
    CRM_API_KEY: z.string().optional(),

    // Agent sandbox proxy
    AGENT_SANDBOX_PROXY_SECRET: z
      .string()
      .min(32, 'AGENT_SANDBOX_PROXY_SECRET must be at least 32 characters')
      .optional()
      .meta({
        description:
          'agent-sandbox-proxy 与 FastGPT 主服务共用的 HMAC 密钥；启用 Agent Sandbox 时必填，至少 32 个字符'
      }),
    AGENT_SANDBOX_PROXY_URL: AgentSandboxProxyUrlSchema.optional().meta({
      description: '浏览器访问 agent-sandbox-proxy 的 WebSocket 地址，必须以 ws:// 或 wss:// 开头'
    }),
    AGENT_SANDBOX_PREVIEW_PROXY_URL: AgentSandboxPreviewProxyUrlSchema.optional().meta({
      description:
        '浏览器访问 Agent Sandbox 文件预览代理的 HTTP(S) 地址，必须以 http:// 或 https:// 开头'
    }),
    // Agent sandbox
    AGENT_SANDBOX_SHOW_FREE_TIP: BoolSchema.default(false).meta({
      description: '是否展示虚拟机“限时免费”标签；默认为 false，为空或未配置时不展示'
    }),

    AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: NumSchema.min(1).default(1).meta({
      description:
        'Agent Sandbox CPU 超卖倍数（仅 opensandbox + kubernetes 运行态生效）：CPU requests = limits / 该值；1 = 该维度不超卖（requests 镜像 limits）'
    }),
    AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR: NumSchema.min(1).default(1).meta({
      description:
        'Agent Sandbox 内存超卖倍数（仅 opensandbox + kubernetes 运行态生效）：内存 requests = limits / 该值；1 = 该维度不超卖（requests 镜像 limits）'
    }),

    // ==================== 智能分块 ====================
    // 配置后，导入文档(文本/PDF/网页)当 chunkSettingMode=intelligent(智能分块) 时，把「文本→chunk」委托给 sangfor 服务。
    // 未配置时智能分块不可用,已启用智能分块的集合导入会显式报错,不影响平台其他分块功能。
    SANGFOR_CHUNK_URL: UrlSchema.optional().meta({
      description: 'sangfor 智能分块服务地址'
    }),
    SANGFOR_CHUNK_KEY: z.string().optional().meta({
      description: 'sangfor 智能分块服务密钥(Bearer Token)'
    }),
    SANGFOR_CHUNK_TIMEOUT_MINUTES: IntSchema.min(1).default(60).meta({
      description: 'sangfor 智能分块服务超时时间(分钟)'
    }),

    // ==================== 数据库与缓存 ====================
    // Redisg
    REDIS_URL: z.string().default('redis://default:mypassword@localhost:6379'),

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
    // ==================== 全文检索 ====================
    MILVUS_LANGUAGE_IDENTIFIER: z.enum(['lingua', 'whatlang']).default('lingua').meta({
      description: 'Milvus 语言识别引擎(BM25 analyzer): lingua(默认) | whatlang'
    }),
    OPENGAUSS_URL: z.string().optional().meta({ description: 'openGauss 向量库连接参数' }),

    // 对象存储
    STORAGE_VENDOR: StorageVendorSchema.default('minio'),
    STORAGE_PUBLIC_BUCKET: z.string().default('fastgpt-public'),
    STORAGE_PRIVATE_BUCKET: z.string().default('fastgpt-private'),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_R2_PUBLIC_ENDPOINT: UrlSchema.optional(),

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

    LANGFUSE_SECRET_KEY: z.string().optional(),
    LANGFUSE_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_BASE_URL: UrlSchema.optional(),

    // ==================== 域名与前端 ====================
    FE_DOMAIN: UrlSchema.meta({
      description:
        '客户端访问 FastGPT 时使用的地址（由协议、主机和可选端口组成），用于补全文件资源路径。例如 https://fastgpt.cn；本地开发可使用 http://localhost:3000。'
    }),
    FILE_DOMAIN: UrlSchema.optional().meta({
      description:
        '文件域名（也指向 FastGPT 服务）；如需更高安全性可独立分配域名，避免高危文件读取到主域名内容'
    }),
    FILE_DOWNLOAD_PUBLIC_URL_PREFIX: UrlSchema.optional().meta({
      description:
        '下载短链公开 URL 前缀。配置后下载链接生成为 {prefix}/{signedAlias}，通常由 nginx rewrite 到 FastGPT /api/system/file/d/{signedAlias}；仅影响下载，不影响上传'
    }),
    NEXT_PUBLIC_BASE_URL: z.string().default(''),

    //==================== 安全配置 ====================

    AUTH_COOKIE_SECURE: BoolSchema.default(false).meta({
      description: '是否强制为登录 Cookie 添加 Secure 属性，仅允许通过 HTTPS 传输'
    }),
    TRUSTED_PROXY_ENABLE: BoolSchema.default(false).meta({
      description:
        '是否启用可信反向代理客户端 IP 校验；关闭时兼容旧逻辑，直接信任 X-Forwarded-For/X-Real-IP'
    }),
    TRUSTED_PROXY_IPS: z.string().optional().meta({
      description:
        '可信反向代理 IP/CIDR 列表，逗号或空白分隔。仅 TRUSTED_PROXY_ENABLE=true 时生效；仅显式可信代理传入的 X-Forwarded-For/X-Real-IP 会用于客户端 IP 解析'
    }),

    //==================== Beta features ====================
    DATASET_SYNONYM_ENABLED: BoolSchema.default(false).meta({
      description: '是否启用知识库同义词能力；关闭时不读取同义词配置或执行查询扩展'
    }),

    // ==================== 并发控制与限制 ====================
    SYSTEM_MIGRATION_BATCH_SIZE: IntSchema.min(50).max(1000).default(100).meta({
      description: '系统迁移任务每批处理的记录数'
    }),
    SYSTEM_MIGRATION_DELAY_SECONDS: IntSchema.min(0).default(0).meta({
      description: '配置了 delay 的系统迁移任务延迟执行时间（秒），默认 0 为不延迟'
    }),

    CHAT_LOG_URL: UrlSchema.optional().meta({
      description: '聊天日志推送地址'
    }),
    CHAT_LOG_INTERVAL: IntSchema.optional().meta({
      description: '聊天日志推送延迟时间（毫秒）'
    }),
    CHAT_LOG_SOURCE_ID_PREFIX: z.string().default('fastgpt-')
  },
  emptyStringAsUndefined: true,
  runtimeEnv: getRuntimeEnv(),
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid environment variables. Please check: ${paths}\n`);
  }
});

/* ===== Bootstrap validation ===== */
if (!isPhaseProductionBuild) {
  validateAgentUsersEnv(serviceEnv);
  validateS3Env(serviceEnv);
  if (serviceEnv.PRO_URL && !serviceEnv.PRO_TOKEN) {
    throw new Error(
      'Invalid environment configuration: PRO_TOKEN is required when PRO_URL is configured.'
    );
  }
}
