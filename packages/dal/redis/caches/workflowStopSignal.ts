import { z } from 'zod';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import { RedisInvalidArgumentError } from '../runtime/errors';
import type { RedisCacheLogger } from '../types';

const WORKFLOW_STOP_SIGNAL_PREFIX = 'agent_runtime_stopping';
export const WORKFLOW_STOP_SIGNAL_TTL_SECONDS = 60;
/** run 级 stop key 必须覆盖长时间 tool；工作流收尾时会主动删除。 */
export const WORKFLOW_STOP_SIGNAL_RUN_TTL_SECONDS = 24 * 60 * 60;

export const WorkflowStopSignalParamsSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  chatId: z.string().min(1),
  generationRunId: z.string().min(1).optional()
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
  chatId,
  generationRunId
}: WorkflowStopSignalParams) => {
  const parsed = WorkflowStopSignalParamsSchema.safeParse({
    sourceType,
    sourceId,
    chatId,
    generationRunId
  });
  if (!parsed.success) {
    throw new RedisInvalidArgumentError({
      operation: 'workflowStopSignal.key',
      message: 'sourceType, sourceId and chatId must be non-empty strings'
    });
  }

  return asRedisLogicalKey(
    `${WORKFLOW_STOP_SIGNAL_PREFIX}:${parsed.data.sourceType}:${parsed.data.sourceId}:${parsed.data.chatId}${
      parsed.data.generationRunId ? `:${parsed.data.generationRunId}` : ''
    }`
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

  /** 设置 run 级停止标记，同时写短 TTL legacy key 兼容滚动发布；Redis 错误向上抛出。 */
  async set(params: WorkflowStopSignalParams) {
    const keys = [getWorkflowStopSignalKey(params)];
    if (params.generationRunId) {
      // 滚动发布期间兼容仍只读取 legacy key 的旧实例。
      keys.push(getWorkflowStopSignalKey({ ...params, generationRunId: undefined }));
    }

    await Promise.all(
      keys.map((key, index) =>
        this.redis.set({
          key,
          value: '1',
          ttlMs:
            (params.generationRunId && index === 0
              ? WORKFLOW_STOP_SIGNAL_RUN_TTL_SECONDS
              : WORKFLOW_STOP_SIGNAL_TTL_SECONDS) * 1000
        })
      )
    );
  }

  /** 检查停止标记；Redis 读取故障按 false 降级。 */
  async isStopping(params: WorkflowStopSignalParams) {
    const keys = [getWorkflowStopSignalKey(params)];
    if (params.generationRunId) {
      keys.push(getWorkflowStopSignalKey({ ...params, generationRunId: undefined }));
    }

    try {
      const results = await Promise.all(keys.map((key) => this.redis.get(key)));
      return results.some((result) => result !== null);
    } catch (error) {
      this.logger.warn(
        'Workflow stop signal read failed open',
        params.generationRunId ? { keys, error } : { key: keys[0], error }
      );
      return false;
    }
  }

  /** 删除停止标记；清理失败只记录 warning，不覆盖业务结果。 */
  async clear(params: WorkflowStopSignalParams) {
    const keys = [getWorkflowStopSignalKey(params)];
    if (params.generationRunId) {
      keys.push(getWorkflowStopSignalKey({ ...params, generationRunId: undefined }));
    }

    try {
      await Promise.all(keys.map((key) => this.redis.delete(key)));
    } catch (error) {
      this.logger.warn(
        'Workflow stop signal clear failed',
        params.generationRunId ? { keys, error } : { key: keys[0], error }
      );
    }
  }
}
