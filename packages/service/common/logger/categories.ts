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
  SYSTEM: ['system'],
  NETWORK: ['system', 'network'],

  // 基础设施层
  INFRA: {
    MONGO: ['infra', 'mongo'],
    POSTGRES: ['infra', 'postgres'],
    REDIS: ['infra', 'redis'],
    VECTOR: ['infra', 'vector'],
    QUEUE: ['infra', 'queue'],
    S3: ['infra', 's3'],
    OTEL: ['infra', 'otel'],
    FILE: ['infra', 'file'],
    WORKER: ['infra', 'worker']
  },

  // HTTP 层
  HTTP: {
    REQUEST: ['http', 'request'],
    RESPONSE: ['http', 'response'],
    ERROR: ['http', 'error']
  },

  // 业务模块层（参考 pages/api）
  MODULE: {
    WORKFLOW: Object.assign(['workflow'], {
      AI: ['workflow', 'ai'],
      DATASET: ['workflow', 'dataset'],
      DISPATCH: ['workflow', 'dispatch'],
      INTERACTIVE: ['workflow', 'interactive'],
      OPTIMIZE_CODE: ['workflow', 'optimize-code'],
      STATUS: ['workflow', 'status'],
      TOOLS: ['workflow', 'tools']
    }),
    APP: Object.assign(['app'], {
      EVALUATION: ['app', 'evaluation'],
      FOLDER: ['app', 'folder'],
      HTTP_TOOLS: ['app', 'http-tools'],
      LOGS: ['app', 'logs'],
      MCP_TOOLS: ['app', 'mcp-tools'],
      TEMPLATE: ['app', 'template'],
      TOOL: ['app', 'tool'],
      VERSION: ['app', 'version']
    }),
    DATASET: Object.assign(['dataset'], {
      API_DATASET: ['dataset', 'api-dataset'],
      COLLECTION: ['dataset', 'collection'],
      DATA: ['dataset', 'data'],
      FILE: ['dataset', 'file'],
      FOLDER: ['dataset', 'folder'],
      QUEUES: ['dataset', 'queues'],
      TRAINING: ['dataset', 'training']
    }),
    AI: Object.assign(['ai'], {
      AGENT: ['ai', 'agent'],
      HELPERBOT: ['ai', 'helperbot'],
      CONFIG: ['ai', 'config'],
      EMBEDDING: ['ai', 'embedding'],
      FUNCTIONS: ['ai', 'functions'],
      LLM: ['ai', 'llm'],
      MODEL: ['ai', 'model'],
      OPTIMIZE_PROMPT: ['ai', 'optimize-prompt'],
      RERANK: ['ai', 'rerank']
    }),
    USER: Object.assign(['user'], {
      ACCOUNT: ['user', 'account'],
      TEAM: ['user', 'team']
    }),
    WALLET: Object.assign(['wallet'], {
      SUB: ['wallet', 'sub'],
      USAGE: ['wallet', 'usage']
    }),
    TEAM: ['team'],
    OUTLINK: Object.assign(['outlink'], {
      DINGTALK: ['outlink', 'dingtalk'],
      FEISHU: ['outlink', 'feishu'],
      OFFIACCOUNT: ['outlink', 'offiaccount'],
      PLAYGROUND: ['outlink', 'playground'],
      TOOLS: ['outlink', 'tools'],
      WECOM: ['outlink', 'wecom']
    }),
    CHAT: Object.assign(['chat'], {
      FEEDBACK: ['chat', 'feedback'],
      FILE: ['chat', 'file'],
      HISTORY: ['chat', 'history'],
      INPUT_GUIDE: ['chat', 'input-guide'],
      ITEM: ['chat', 'item'],
      OUTLINK: ['chat', 'outlink'],
      QUOTE: ['chat', 'quote'],
      RECORD: ['chat', 'record'],
      TEAM: ['chat', 'team']
    }),
    PERMISSION: Object.assign(['permission'], {
      INHERIT: ['permission', 'inherit']
    }),
    PLUGIN: Object.assign(['plugin'], {
      ADMIN: ['plugin', 'admin'],
      ADMIN_MARKETPLACE: ['plugin', 'admin', 'marketplace'],
      ADMIN_PKG: ['plugin', 'admin', 'pkg'],
      ADMIN_TOOL: ['plugin', 'admin', 'tool'],
      TEAM: ['plugin', 'team'],
      TOOL_TAG: ['plugin', 'tool-tag']
    }),
    MCP: Object.assign(['mcp'], {
      APP: ['mcp', 'app'],
      CLIENT: ['mcp', 'client'],
      SERVER: ['mcp', 'server']
    }),
    OPENAPI: Object.assign(['openapi'], {
      TOOLS: ['openapi', 'tools']
    }),
    MARKETING: ['marketing']
  },

  // 错误层
  ERROR: ['error'],

  // 事件层
  EVENT: {
    OUTLINK: ['event', 'outlink'],
    FEISHU: ['event', 'feishu'],
    WECHAT: ['event', 'wechat'],
    TRACK: ['event', 'track']
  }
};

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
