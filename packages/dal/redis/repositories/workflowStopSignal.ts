import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { z } from 'zod';
import { asRedisLogicalKey, redisRepositoryAdapter, type RedisStoreAdapter } from '../adapter';
import { RedisInvalidArgumentError } from '../runtime/errors';

const WORKFLOW_STOP_SIGNAL_PREFIX = 'agent_runtime_stopping';
export const WORKFLOW_STOP_SIGNAL_TTL_SECONDS = 60;

export const WorkflowStopSignalParamsSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  chatId: z.string().min(1)
});

export type WorkflowStopSignalParams = z.infer<typeof WorkflowStopSignalParamsSchema> & {
  sourceType: ChatSourceTypeEnum;
};

export type WorkflowStopSignalRepositoryLogger = {
  warn: (message: string, metadata: Record<string, unknown>) => void;
};

export type WorkflowStopSignalRepositoryDependencies = {
  redis?: Pick<RedisStoreAdapter, 'delete' | 'get' | 'set'>;
  logger: WorkflowStopSignalRepositoryLogger;
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

  return asRedisLogicalKey(
    `${WORKFLOW_STOP_SIGNAL_PREFIX}:${parsed.data.sourceType}:${parsed.data.sourceId}:${parsed.data.chatId}`
  );
};

/**
 * 创建 workflow 与 auxiliary generation 共用的停止信号 Repository。
 *
 * 写入故障由调用方处理为 fail-closed；读取故障按 false 降级；清理为 best-effort，避免
 * Redis 故障覆盖工作流或辅助生成的最终结果。
 */
export const createWorkflowStopSignalRepository = ({
  redis = redisRepositoryAdapter,
  logger
}: WorkflowStopSignalRepositoryDependencies) => ({
  /** 设置 60 秒停止标记；Redis 错误继续向上抛出。 */
  set: async (params: WorkflowStopSignalParams) => {
    await redis.set({
      key: getWorkflowStopSignalKey(params),
      value: '1',
      ttlMs: WORKFLOW_STOP_SIGNAL_TTL_SECONDS * 1000
    });
  },

  /** 检查停止标记；Redis 读取故障按 false 降级。 */
  isStopping: async (params: WorkflowStopSignalParams) => {
    const key = getWorkflowStopSignalKey(params);
    try {
      const result = await redis.get(key);
      return result !== null;
    } catch (error) {
      logger.warn('Workflow stop signal read failed open', { key, error });
      return false;
    }
  },

  /** 删除停止标记；清理失败只记录 warning，不覆盖业务结果。 */
  clear: async (params: WorkflowStopSignalParams) => {
    const key = getWorkflowStopSignalKey(params);
    try {
      await redis.delete(key);
    } catch (error) {
      logger.warn('Workflow stop signal clear failed', { key, error });
    }
  }
});

export type WorkflowStopSignalRepository = ReturnType<typeof createWorkflowStopSignalRepository>;
