import { ChatIdSchema } from '@fastgpt/global/core/chat/schema';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import { RedisInvalidArgumentError } from '../runtime/errors';
import type { RedisCacheLogger } from '../types';

const WORKFLOW_STOP_SIGNAL_PREFIX = 'agent_runtime_stopping';
export const WORKFLOW_STOP_SIGNAL_TTL_SECONDS = 60;
const CLEAR_STOP_SIGNAL_IF_UNCHANGED_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export const WorkflowStopSignalParamsSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  chatId: ChatIdSchema.min(1)
});

export type WorkflowStopSignalParams = z.infer<typeof WorkflowStopSignalParamsSchema>;

export type WorkflowStopSignalCacheOptions = {
  redis?: RedisCacheAdapter;
  logger: RedisCacheLogger<'warn'>;
};

/** 构造运行态停止标记 logical key；物理前缀由 Redis adapter 统一添加。 */
export const getWorkflowStopSignalKey = ({
  sourceType,
  sourceId,
  chatId
}: WorkflowStopSignalParams) => {
  const parsed = WorkflowStopSignalParamsSchema.safeParse({ sourceType, sourceId, chatId });
  if (!parsed.success) {
    throw new RedisInvalidArgumentError({
      operation: 'workflowStopSignal.key',
      message: 'sourceType, sourceId and chatId must be non-empty strings'
    });
  }

  // 与会话租约使用相同的 ObjectId 规范化，保证停止 API 和生成入口能命中同一信号。
  const normalizedSourceId = /^[0-9a-f]{24}$/i.test(parsed.data.sourceId)
    ? parsed.data.sourceId.toLowerCase()
    : parsed.data.sourceId;
  return asRedisLogicalKey(
    `${WORKFLOW_STOP_SIGNAL_PREFIX}:${parsed.data.sourceType}:${normalizedSourceId}:${parsed.data.chatId}`
  );
};

/**
 * workflow 与 auxiliary generation 共用的停止信号 Cache。
 *
 * 写入故障由调用方处理为 fail-closed；读取故障按 false 降级；清理为 best-effort，避免
 * Redis 故障覆盖工作流或辅助生成的最终结果。
 */
export class WorkflowStopSignalCache {
  private readonly redis: RedisCacheAdapter;
  private readonly logger: RedisCacheLogger<'warn'>;

  constructor({ redis = redisCacheAdapter, logger }: WorkflowStopSignalCacheOptions) {
    this.redis = redis;
    this.logger = logger;
  }

  /** 设置 60 秒停止标记，每次写入使用不同版本，避免迟到清理删除新的停止请求；写入错误上抛。 */
  async set(params: WorkflowStopSignalParams) {
    await this.redis.set({
      key: getWorkflowStopSignalKey(params),
      value: randomUUID(),
      ttlMs: WORKFLOW_STOP_SIGNAL_TTL_SECONDS * 1000
    });
  }

  /** 检查停止标记；Redis 读取故障按 false 降级。 */
  async isStopping(params: WorkflowStopSignalParams) {
    const key = getWorkflowStopSignalKey(params);
    try {
      const result = await this.redis.get(key);
      return result !== null;
    } catch (error) {
      this.logger.warn('Workflow stop signal read failed open', { key, error });
      return false;
    }
  }

  /** 删除停止标记；提供 expectedValue 时只清理相同版本，迟到操作也不会删除新 stop。失败仅记录日志。 */
  async clear(params: WorkflowStopSignalParams, expectedValue?: string) {
    const key = getWorkflowStopSignalKey(params);
    try {
      if (expectedValue === undefined) {
        await this.redis.delete(key);
      } else {
        await this.redis.evalScript({
          script: CLEAR_STOP_SIGNAL_IF_UNCHANGED_SCRIPT,
          keys: [key],
          args: [expectedValue]
        });
      }
    } catch (error) {
      this.logger.warn('Workflow stop signal clear failed', { key, error });
    }
  }
}
