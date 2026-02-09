/**
 * 标准化的 Logger Category 定义
 *
 * Category 层级结构:
 * - app: 应用层通用日志
 * - infra: 基础设施层 (数据库、缓存等)
 * - http: HTTP 请求/响应层
 * - mod: 业务模块层
 * - error: 错误日志层
 * - event: 事件日志层
 */

export const LogCategories = {
  // 应用层日志
  APP: ['app'] as const,

  // 基础设施层
  INFRA: {
    MONGO: ['infra', 'mongo'] as const,
    POSTGRES: ['infra', 'postgres'] as const,
    REDIS: ['infra', 'redis'] as const,
    VECTOR: ['infra', 'vector'] as const
  },

  // HTTP 层
  HTTP: {
    REQUEST: ['http', 'request'] as const,
    RESPONSE: ['http', 'response'] as const,
    ERROR: ['http', 'error'] as const
  },

  // 业务模块层
  MODULE: {
    WORKFLOW: ['mod', 'workflow'] as const,
    DATASET: ['mod', 'dataset'] as const,
    AI: ['mod', 'ai'] as const,
    USER: ['mod', 'user'] as const,
    WALLET: ['mod', 'wallet'] as const,
    TEAM: ['mod', 'team'] as const,
    OUTLINK: ['mod', 'outlink'] as const
  },

  // 错误层
  ERROR: ['error'] as const,

  // 事件层
  EVENT: {
    OUTLINK: ['event', 'outlink'] as const,
    FEISHU: ['event', 'feishu'] as const,
    WECHAT: ['event', 'wechat'] as const
  }
} as const;

// 导出类型以供 TypeScript 类型推断
export type LogCategory =
  | typeof LogCategories.APP
  | (typeof LogCategories.INFRA)[keyof typeof LogCategories.INFRA]
  | (typeof LogCategories.HTTP)[keyof typeof LogCategories.HTTP]
  | (typeof LogCategories.MODULE)[keyof typeof LogCategories.MODULE]
  | typeof LogCategories.ERROR
  | (typeof LogCategories.EVENT)[keyof typeof LogCategories.EVENT];
