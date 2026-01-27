export const root = ['app'] as const;

export const http = {
  root: ['http'],
  request: ['http', 'req'],
  response: ['http', 'res'],
  rateLimiter: ['http', 'rate-limiter']
} as const;

export const middleware = {
  auth: ['middleware', 'auth']
} as const;

export const mod = {
  llm: ['mod', 'llm'],
  coreAi: ['mod', 'core', 'ai'],
  coreApp: ['mod', 'core', 'app'],
  coreChat: ['mod', 'core', 'chat'],
  coreDataset: ['mod', 'core', 'dataset'],
  coreWorkflow: ['mod', 'core', 'workflow'],
  support: ['mod', 'support'],
  app: ['mod', 'app'],
  common: ['mod', 'common'],
  worker: ['mod', 'worker'],
  mcp: ['mod', 'mcp'],
  marketplace: ['mod', 'marketplace'],
  sso: ['mod', 'sso']
} as const;

export const infra = {
  mongo: ['infra', 'mongo'],
  redis: ['infra', 'redis'],
  storage: ['infra', 'storage'],
  pgvector: ['infra', 'pgvector'],
  bullmq: ['infra', 'bullmq'],
  aiProxy: ['infra', 'ai-proxy'],
  milvus: ['infra', 'milvus'],
  oceanbase: ['infra', 'oceanbase'],
  otel: ['infra', 'otel']
} as const;

export type LogCategory =
  | typeof root
  | (typeof http)[keyof typeof http]
  | (typeof middleware)[keyof typeof middleware]
  | (typeof mod)[keyof typeof mod]
  | (typeof infra)[keyof typeof infra];
