/** 环境变量配置，集中管理所有可配置项 */
export const config = {
  // ===== 服务 =====

  /** 服务端口 */
  port: parseInt(process.env.SANDBOX_PORT || '3000', 10),

  /** Bearer Token 认证 */
  token: process.env.SANDBOX_TOKEN || '',

  /** 日志级别 */
  logLevel: process.env.LOG_LEVEL || 'info',

  // ===== 资源限制 =====

  /** 默认超时（ms） */
  defaultTimeoutMs: parseInt(process.env.SANDBOX_TIMEOUT || '10000', 10),

  /** 超时上限（ms），防止恶意请求 */
  maxTimeoutMs: parseInt(process.env.SANDBOX_MAX_TIMEOUT || '60000', 10),

  /** 默认内存限制（MB） */
  defaultMemoryMB: parseInt(process.env.SANDBOX_MEMORY_MB || '64', 10),

  /** 内存上限（MB） */
  maxMemoryMB: parseInt(process.env.SANDBOX_MAX_MEMORY_MB || '256', 10),

  /** 默认磁盘限制（MB） */
  defaultDiskMB: parseInt(process.env.SANDBOX_DISK_MB || '10', 10),

  /** 磁盘上限（MB） */
  maxDiskMB: parseInt(process.env.SANDBOX_MAX_DISK_MB || '100', 10),

  // ===== 网络请求限制 =====

  /** 单次执行最大 HTTP 请求数 */
  maxRequests: parseInt(process.env.SANDBOX_MAX_REQUESTS || '30', 10),

  /** 单次 HTTP 请求超时（ms） */
  requestTimeoutMs: parseInt(process.env.SANDBOX_REQUEST_TIMEOUT || '10000', 10),

  /** 最大响应体大小（bytes） */
  maxResponseSize: parseInt(process.env.SANDBOX_MAX_RESPONSE_SIZE || String(2 * 1024 * 1024), 10),

  // ===== 进程池 =====

  /** JS 进程池大小（0 = 不预热） */
  jsPoolSize: parseInt(process.env.SANDBOX_JS_POOL_SIZE || '0', 10),

  /** Python 进程池大小（0 = 不预热） */
  pythonPoolSize: parseInt(process.env.SANDBOX_PYTHON_POOL_SIZE || '0', 10),

  /** 空闲进程最大存活时间（ms） */
  poolMaxIdleMs: parseInt(process.env.SANDBOX_POOL_MAX_IDLE_MS || '300000', 10),

  /** 单个进程最大复用次数 */
  poolMaxRecycle: parseInt(process.env.SANDBOX_POOL_RECYCLE || '50', 10)
} as const;
