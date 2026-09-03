/** 系统升级脚本的持久化状态，也是管理端展示与 API 传输使用的公共枚举。 */
export enum SystemMigrationStatusEnum {
  pending = 'pending',
  running = 'running',
  failed = 'failed',
  succeeded = 'succeeded'
}

/** 任务失败后的队列调度策略；与是否阻塞节点启动相互独立。 */
export enum SystemMigrationFailurePolicyEnum {
  stop = 'stop',
  continue = 'continue'
}

/**
 * 系统升级脚本公共数据的输入上限。
 * 限制同时约束任务上下文、Mongo 持久化和 API 契约，避免各层采用不同边界。
 */
export const systemMigrationLimits = {
  /** 单个进度参数、成功结果或失败记录定位数据最多包含的字段数。 */
  maxDataEntries: 20,
  /** 进度参数、成功结果或失败记录定位数据中单个字符串值的最大字符数。 */
  maxDataStringLength: 1_000,
  /** 状态表 lastError 和错误明细 reason.message 的最大字符数。 */
  maxErrorMessageLength: 4_000,
  /** 单个 checkpoint 经 JSON 序列化后的最大 UTF-8 字节数。 */
  maxCheckpointBytes: 64 * 1024
} as const;
