import z from 'zod';
import { BoolSchema, IntSchema, NumSchema, UrlSchema } from '@fastgpt/global/common/zod';
import { DEFAULT_MAX_FOLDER_DEPTH } from '@fastgpt/global/common/parentFolder/depth';
import { agentSandboxProviderList } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxVolumeNameSchema } from '@fastgpt/global/core/ai/sandbox/volume';

const defaultableIntSchema = (defaultValue: number) =>
  z.preprocess((value) => (value === '' || value === undefined ? defaultValue : value), IntSchema);

/**
 * 仅供 4.18 实例配置迁移读取的历史 ENV 合约。
 * 运行时 serviceEnv/appEnv 不再声明这些字段；保留历史校验和默认值以承接已有部署，
 * 不让退役 ENV 再影响业务读取或全局 ENV 初始化。AI Proxy 可缺省，启用条件由迁移和配置校验负责。
 */
const LegacyInstanceConfigEnvSchema = z.object({
  PLUGIN_BASE_URL: UrlSchema.default('http://localhost:3004'),
  PLUGIN_TOKEN: z.string().default('token'),
  CODE_SANDBOX_URL: UrlSchema.default('http://localhost:3002'),
  CODE_SANDBOX_TOKEN: z.string().default('codesandbox'),
  AIPROXY_API_ENDPOINT: UrlSchema.optional(),
  AIPROXY_API_TOKEN: z.string().trim().min(1).optional(),
  AGENT_SANDBOX_PROVIDER: z.enum(agentSandboxProviderList).optional().meta({
    description: 'Agent 沙箱提供方，可选 sealosdevbox 或 opensandbox；为空时不启用沙箱'
  }),
  AGENT_SANDBOX_SEALOS_BASEURL: UrlSchema.optional().meta({
    description: 'Sealos Devbox 服务地址'
  }),
  AGENT_SANDBOX_SEALOS_TOKEN: z.string().optional().meta({
    description: 'Sealos Devbox 访问 Token'
  }),
  AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: z.string().default('/home/devbox/workspace').meta({
    description: 'Sealos Devbox 沙箱内工作目录'
  }),
  AGENT_SANDBOX_SEALOS_IMAGE: z.string().optional().meta({
    description: 'Sealos Devbox 使用的运行态镜像；启用 sealosdevbox 时必填'
  }),
  AGENT_SANDBOX_CPU_COUNT: NumSchema.positive().default(1).meta({
    description: 'Agent Sandbox 实例的 CPU 核数上限'
  }),
  AGENT_SANDBOX_MEMORY_MIB: IntSchema.min(1).default(2048).meta({
    description: 'Agent Sandbox 实例的内存上限（MiB）'
  }),
  AGENT_SANDBOX_STORAGE_SIZE_GI: NumSchema.min(1).default(1).meta({
    description: 'Agent Sandbox 存储容量，单位 Gi'
  }),
  AGENT_SANDBOX_OPENSANDBOX_BASEURL: UrlSchema.optional(),
  AGENT_SANDBOX_OPENSANDBOX_API_KEY: z.string().optional(),
  AGENT_SANDBOX_OPENSANDBOX_RUNTIME: z.enum(['docker', 'kubernetes']).default('docker'),
  AGENT_SANDBOX_OPENSANDBOX_IMAGE: z.string().optional().meta({
    description: 'OpenSandbox 使用的运行态镜像；启用 opensandbox 时必填'
  }),
  AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: BoolSchema.default(true),
  AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL: UrlSchema.optional(),
  AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN: z.string().optional(),
  AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX: SandboxVolumeNameSchema.default(
    'fastgpt-session'
  ).meta({ description: 'OpenSandbox persistent volume claimName prefix' }),
  AGENT_SANDBOX_SUSPEND_MINUTES: IntSchema.min(1).default(60).meta({
    description: 'Agent sandbox 持续未活跃多少分钟后自动暂停'
  }),
  AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS: IntSchema.min(1).default(7).meta({
    description: '已暂停的 Agent sandbox 持续未活跃多少天后自动归档'
  }),
  AGENT_SANDBOX_MAX: IntSchema.min(1).default(100).meta({
    description: 'Agent sandbox 活跃实例系统总上限（app 会话与技能编辑共用同一计数池，超出即拒绝）'
  }),
  AGENT_SANDBOX_MAX_PER_TEAM: IntSchema.min(1).optional().meta({
    description: '单团队 Agent sandbox 活跃实例配额；不配置表示不限制'
  }),
  AGENT_SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS: IntSchema.min(1).max(600).default(30).meta({
    description: 'Agent sandbox entrypoint 执行超时时间（秒）'
  }),
  AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES: IntSchema.min(1)
    .default(64 * 1024 * 1024)
    .meta({
      description:
        'Agent sandbox WebSocket 单消息上限（字节），由 FastGPT app 统一下发给 proxy/IDE Agent'
    }),
  AGENT_SANDBOX_WS_MAX_FRAME_BYTES: IntSchema.min(1)
    .default(16 * 1024 * 1024)
    .meta({
      description:
        'Agent sandbox WebSocket 单帧上限（字节），由 FastGPT app 统一下发给 proxy/IDE Agent'
    }),
  AGENT_SANDBOX_NPM_REGISTRY: z.string().optional(),
  AGENT_SANDBOX_PYPI_INDEX_URL: z.string().optional(),
  AGENT_SANDBOX_APT_MIRROR: z.string().optional().meta({
    description: '仅 root 权限的 Ubuntu 或 Debian Agent Sandbox 使用的 apt 镜像仓库 URL'
  }),
  CUSTOM_PDF_PARSE_URL: UrlSchema.optional().meta({
    description: '自定义 PDF 解析服务地址'
  }),
  CUSTOM_PDF_PARSE_KEY: z.string().optional().meta({
    description: '自定义 PDF 解析服务密钥'
  }),
  SOMARK_API_KEY: z.string().optional().meta({
    description: 'SoMark PDF 解析服务密钥'
  }),
  DOC2X_KEY: z.string().optional().meta({
    description: 'Doc2x PDF 解析服务密钥'
  }),
  TEXTIN_APP_ID: z.string().optional().meta({
    description: '合合信息 Textin 服务 App ID'
  }),
  TEXTIN_SECRET_CODE: z.string().optional().meta({
    description: '合合信息 Textin 服务 Secret Code'
  }),
  DOCUMENT_PARSE_PROVIDER: z.enum(['', 'sangfor']).default('').meta({
    description:
      '文档解析 provider，默认不启用；sangfor 表示命中的扩展名直接走 Sangfor，覆盖「增强解析」开关'
  }),
  SANGFOR_PARSE_EXTENSIONS: z.string().default('pdf').meta({
    description: 'Sangfor 接管的扩展名（逗号分隔，默认 pdf）；未命中的文件继续原解析链'
  }),
  SANGFOR_PARSE_TIMEOUT_SECONDS: IntSchema.min(1).max(7200).default(600).meta({
    description: 'Sangfor 文档解析请求超时时间（秒），默认 10 分钟，最大 2 小时'
  }),
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
  HNSW_EF_SEARCH: IntSchema.min(1).default(200).meta({
    description: 'HNSW 向量检索搜索宽度，对 PG / Milvus / OceanBase / SeekDB / OpenGauss 生效'
  }),
  STORAGE_EXTERNAL_ENDPOINT: UrlSchema.optional().meta({
    description:
      '客户端可直连的对象存储地址；首次部署时作为实例配置 storage.externalEndpoint 的初值，之后管理界面配置优先'
  }),
  STORAGE_S3_CDN_ENDPOINT: UrlSchema.optional().meta({
    description:
      'short-redirect 临时下载地址使用的 CDN 地址；首次部署时作为实例配置 storage.cdnEndpoint 的初值，之后管理界面配置优先'
  }),
  STORAGE_DOWNLOAD_URL_MODE: z.enum(['short-proxy', 'short-redirect']).default('short-proxy').meta({
    description:
      '下载链接模式：short-proxy 返回 FastGPT 短链并由 app 代理；short-redirect 返回 FastGPT 短链并 302 到短 TTL S3 链接'
  }),
  STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS: IntSchema.min(1).default(300).meta({
    description: 'short-redirect 模式下临时 S3 预签名下载链接 TTL（秒）'
  }),
  FILE_URL_EXPIRED_DAYS: NumSchema.positive().default(90).meta({
    description: '聊天记录中文件访问短链有效期（天），支持小数'
  }),
  USE_IP_LIMIT: BoolSchema.default(false).meta({ description: '是否启用 IP 限流' }),
  CHECK_INTERNAL_IP: BoolSchema.default(false).meta({ description: '是否启用内网 IP 检查' }),
  CSRF_ENABLED: BoolSchema.default(true).meta({
    description: '是否启用 CSRF Web 请求标记校验'
  }),
  PASSWORD_LOGIN_MINUTE_LIMIT_COUNT: defaultableIntSchema(10).meta({
    description: '密码登录每分钟次数限制'
  }),
  MAX_LOGIN_SESSION: IntSchema.default(10).meta({ description: '最大登录客户端数量（默认 10）' }),
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .meta({ description: '自定义跨域；不配置时默认允许所有跨域（逗号分割）' }),
  MULTIPLE_DATA_TO_BASE64: BoolSchema.default(false).meta({
    description: '是否强制将图片、音频、视频转成 base64 传递给模型'
  }),
  AGENT_ENGINE: z.enum(['fastAgent', 'piAgent']).default('fastAgent').meta({
    description: 'Agent 引擎选择：fastAgent（FastGPT agent loop）| piAgent（pi-agent-core 引擎）'
  }),
  SKIP_FILE_TYPE_CHECK: BoolSchema.default(false).meta({
    description: '是否跳过文件类型检查'
  }),
  DISABLE_CACHE: BoolSchema.default(false).meta({
    description: '是否禁用系统内存缓存'
  }),
  DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED: BoolSchema.default(false).meta({
    description: '新建团队时是否为默认全员组授予应用、Skill、知识库和 API Key 创建权限'
  }),
  WECHAT_CHANNEL_CONCURRENCY: IntSchema.min(10).default(1000).meta({
    description: '微信渠道 poll worker 并发数'
  }),
  XLSX_PARSE_MAX_ROWS: IntSchema.min(1).max(1_048_576).default(100_000).meta({
    description: 'XLSX 单个工作表允许的最大行数'
  }),
  XLSX_PARSE_MAX_COLUMNS: IntSchema.min(1).max(16_384).default(1_000).meta({
    description: 'XLSX 单个工作表允许的最大列数'
  }),
  XLSX_PARSE_MAX_CELLS: IntSchema.min(1).max(Number.MAX_SAFE_INTEGER).default(1_000_000).meta({
    description: 'XLSX 工作簿允许的累计范围单元格数'
  }),
  XLSX_PARSE_MAX_MERGED_CELLS: IntSchema.min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(1_000_000)
    .meta({
      description: 'XLSX 工作簿允许的累计合并单元格回填量'
    }),
  PARSE_FILE_TIMEOUT_SECONDS: IntSchema.min(60).max(6000).default(600).meta({
    description: '文件解析单任务超时时间（秒）'
  }),
  WORKFLOW_MAX_RUN_TIMES: IntSchema.default(500).meta({
    description: '工作流最大运行次数，避免极端死循环'
  }),
  RETRIEVAL_RESULTS_LIMIT: IntSchema.default(0).meta({
    description: '知识库检索节点日志详情记录的召回候选集上限，默认 0 表示不记录'
  }),
  WORKFLOW_MAX_LOOP_TIMES: IntSchema.default(100).meta({
    description: '循环/并行节点最大输入数组长度（默认 100）'
  }),
  WORKFLOW_PARALLEL_MAX_CONCURRENCY: IntSchema.default(10).meta({
    description: '并行节点并发上限（最终会 clamp 到 [5, 100]，默认 10）'
  }),
  SYSTEM_MAX_STRING_LENGTH_M: IntSchema.min(1).max(100).default(100).meta({
    description:
      '系统同步字符串处理最大字符数（M，1M=1,000,000 字符），用于变量替换等 CPU 密集文本操作'
  }),
  CHAT_MAX_QPM: IntSchema.default(5000).meta({
    description: '聊天 QPM（若用户套餐有限制，这里不生效）'
  }),
  TRACK_BATCH_UPDATE_TIME: IntSchema.default(10000).meta({
    description: '埋点批量写入间隔（毫秒）'
  }),
  EVAL_CONCURRENCY: IntSchema.default(3).meta({
    description: '评估任务 worker 并发数'
  }),
  DATASET_PARSE_MAX_PROCESS: IntSchema.min(1).default(10).meta({
    description: '知识库文件解析最大并发数'
  }),
  VECTOR_MAX_PROCESS: IntSchema.min(1).default(10).meta({
    description: '向量训练最大并发数'
  }),
  QA_MAX_PROCESS: IntSchema.min(1).default(10).meta({
    description: '问答拆分最大并发数'
  }),
  VLM_MAX_PROCESS: IntSchema.min(1).default(10).meta({
    description: '图片理解模型最大处理并发数'
  }),
  SERVICE_REQUEST_MAX_CONTENT_LENGTH: IntSchema.default(10).meta({
    description: '服务器接收请求的最大大小（MB）'
  }),
  MAX_FOLDER_DEPTH: IntSchema.min(2).max(20).default(DEFAULT_MAX_FOLDER_DEPTH).meta({
    description: '允许的最深文件夹层级，默认 4（根目录下最多 4 层文件夹）'
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
  FEISHU_BASE_URL: UrlSchema.default('https://open.feishu.cn'),
  DINGTALK_BASE_URL: UrlSchema.default('https://api.dingtalk.com'),
  DINGTALK_OAPI_BASE_URL: UrlSchema.default('https://oapi.dingtalk.com'),
  YUQUE_DATASET_BASE_URL: UrlSchema.default('https://www.yuque.com'),
  SSE_MCP_SERVER_PROXY_ENDPOINT: UrlSchema.optional(),
  SYSTEM_NAME: z.string().default('AI'),
  SYSTEM_DESCRIPTION: z.string().default(''),
  SYSTEM_FAVICON: z.string().default(''),
  PAY_FORM_URL: UrlSchema.default(''),
  SHOW_COUPON: BoolSchema.default(false),
  SHOW_DISCOUNT_COUPON: BoolSchema.default(false),
  HIDE_CHAT_COPYRIGHT_SETTING: BoolSchema.default(false),
  WECOM_LOGIN_AUTO_REDIRECT: BoolSchema.default(false),
  OPENAPI_KEY_MAX_COUNT: IntSchema.min(1).default(100),
  MARKETPLACE_URL: UrlSchema.default('https://v3.marketplace.fastgpt.cn'),
  PASSWORD_EXPIRED_MONTH: IntSchema.optional(),
  CUSTOM_API_DOMAIN: UrlSchema.default(''),
  CUSTOM_SHARE_PAGE_DOMAIN: UrlSchema.default(''),
  SCRIPTS: z.string().optional()
});

/** 在执行迁移时读取历史变量；空字符串按未配置处理，报错只列字段路径、不输出密钥值。 */
export const readLegacyInstanceConfigEnv = () => {
  const env = Object.fromEntries(
    Object.entries(process.env).map(([key, value]) => [key, value === '' ? undefined : value])
  );
  const result = LegacyInstanceConfigEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      'Invalid legacy instance config environment variables: ' +
        result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    );
  }
  return result.data;
};
