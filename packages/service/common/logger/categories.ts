/**
 * 标准化的 Logger Category 定义
 *
 * Category 层级结构:
 * - system: 应用层通用日志
 * - infra: 基础设施层 (数据库、缓存等)
 * - http: HTTP 请求/响应层
 * - module: 业务模块层（参考 pages/api，省略 core/support 前缀）
 * - error: 错误日志层
 * - event: 事件日志层
 */

export const LogCategories = {
  // 应用层日志
  SYSTEM: ['system'] as const,

  // 基础设施层
  INFRA: {
    MONGO: ['infra', 'mongo'] as const,
    POSTGRES: ['infra', 'postgres'] as const,
    REDIS: ['infra', 'redis'] as const,
    VECTOR: ['infra', 'vector'] as const,
    QUEUE: ['infra', 'queue'] as const,
    S3: ['infra', 's3'] as const,
    GEO: ['infra', 'geo'] as const,
    OTEL: ['infra', 'otel'] as const,
    NETWORK: ['infra', 'network'] as const,
    FILE: ['infra', 'file'] as const,
    WORKER: ['infra', 'worker'] as const
  },

  // HTTP 层
  HTTP: {
    REQUEST: ['http', 'request'] as const,
    RESPONSE: ['http', 'response'] as const,
    ERROR: ['http', 'error'] as const
  },

  // 业务模块层（参考 pages/api）
  MODULE: {
    WORKFLOW: ['workflow'] as const,
    APP: Object.assign(['app'] as const, {
      FOLDER: ['app', 'folder'] as const,
      HTTP_TOOLS: ['app', 'http-tools'] as const,
      LOGS: ['app', 'logs'] as const,
      MCP_TOOLS: ['app', 'mcp-tools'] as const,
      TEMPLATE: ['app', 'template'] as const,
      TOOL: ['app', 'tool'] as const,
      VERSION: ['app', 'version'] as const
    }),
    DATASET: Object.assign(['dataset'] as const, {
      API_DATASET: ['dataset', 'api-dataset'] as const,
      COLLECTION: ['dataset', 'collection'] as const,
      DATA: ['dataset', 'data'] as const,
      FILE: ['dataset', 'file'] as const,
      FOLDER: ['dataset', 'folder'] as const,
      TRAINING: ['dataset', 'training'] as const
    }),
    AI: Object.assign(['ai'] as const, {
      AGENT: ['ai', 'agent'] as const,
      MODEL: ['ai', 'model'] as const
    }),
    USER: Object.assign(['user'] as const, {
      ACCOUNT: ['user', 'account'] as const,
      TEAM: ['user', 'team'] as const
    }),
    WALLET: Object.assign(['wallet'] as const, {
      USAGE: ['wallet', 'usage'] as const
    }),
    TEAM: ['team'] as const,
    OUTLINK: Object.assign(['outlink'] as const, {
      DINGTALK: ['outlink', 'dingtalk'] as const,
      FEISHU: ['outlink', 'feishu'] as const,
      OFFIACCOUNT: ['outlink', 'offiaccount'] as const,
      PLAYGROUND: ['outlink', 'playground'] as const,
      WECOM: ['outlink', 'wecom'] as const
    }),
    CHAT: Object.assign(['chat'] as const, {
      FEEDBACK: ['chat', 'feedback'] as const,
      FILE: ['chat', 'file'] as const,
      HISTORY: ['chat', 'history'] as const,
      INPUT_GUIDE: ['chat', 'input-guide'] as const,
      ITEM: ['chat', 'item'] as const,
      OUTLINK: ['chat', 'outlink'] as const,
      QUOTE: ['chat', 'quote'] as const,
      RECORD: ['chat', 'record'] as const,
      TEAM: ['chat', 'team'] as const
    }),
    PERMISSION: ['permission'] as const,
    PLUGIN: Object.assign(['plugin'] as const, {
      ADMIN: ['plugin', 'admin'] as const,
      ADMIN_MARKETPLACE: ['plugin', 'admin', 'marketplace'] as const,
      ADMIN_PKG: ['plugin', 'admin', 'pkg'] as const,
      ADMIN_TOOL: ['plugin', 'admin', 'tool'] as const,
      TEAM: ['plugin', 'team'] as const,
      TOOL_TAG: ['plugin', 'tool-tag'] as const
    }),
    MCP: Object.assign(['mcp'] as const, {
      APP: ['mcp', 'app'] as const,
      CLIENT: ['mcp', 'client'] as const,
      SERVER: ['mcp', 'server'] as const
    }),
    OPENAPI: ['openapi'] as const,
    MARKETING: ['marketing'] as const
  },

  // 错误层
  ERROR: ['error'] as const,

  // 事件层
  EVENT: {
    OUTLINK: ['event', 'outlink'] as const,
    FEISHU: ['event', 'feishu'] as const,
    WECHAT: ['event', 'wechat'] as const,
    TRACK: ['event', 'track'] as const
  }
} as const;

type ModuleCategory = Lowercase<keyof typeof LogCategories.MODULE>;
export const moduleCategories: readonly ModuleCategory[] = Object.keys(LogCategories.MODULE).map(
  (key) => key.toLowerCase() as ModuleCategory
);

// 导出类型以供 TypeScript 类型推断
export type LogCategory =
  | typeof LogCategories.SYSTEM
  | (typeof LogCategories.INFRA)[keyof typeof LogCategories.INFRA]
  | (typeof LogCategories.HTTP)[keyof typeof LogCategories.HTTP]
  | (typeof LogCategories.MODULE)[keyof typeof LogCategories.MODULE]
  | typeof LogCategories.ERROR
  | (typeof LogCategories.EVENT)[keyof typeof LogCategories.EVENT];
