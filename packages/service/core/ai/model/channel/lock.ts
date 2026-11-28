import {
  isRedisLeaseError,
  LeaseCache,
  RedisLeaseAcquireError,
  type RedisLeaseContext
} from '@fastgpt/dal/redis/caches/lease';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ServerConfigError, UserError } from '@fastgpt/global/common/error/utils';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { getLogger, LogCategories } from '../../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);
const channelWriteLease = new LeaseCache();

const CHANNEL_WRITE_LOCK_TTL_MS = 30_000;
const CHANNEL_WRITE_LOCK_WAIT_TIMEOUT_MS = 15_000;

type ChannelWriteLockParams<T> = {
  channelId: number;
  channelType: ChannelType;
  tmbId: string;
  ttlMs?: number;
  waitTimeoutMs?: number;
  fn: (context: RedisLeaseContext) => Promise<T>;
};

/**
 * 串行化同一渠道的「读取 → 计算 patch → 全量回写」短临界区。
 *
 * AI Proxy 的 PUT 渠道接口对 models / model_mapping / configs 是整字段覆写，
 * 导入、手动绑定、改名同步、删模型清理和编辑渠道必须共用同一把排队锁，
 * 避免并发写入静默覆盖或在短暂重叠时 fail-fast 留下未绑定模型。
 */
export const withChannelWriteLock = async <T>({
  channelId,
  channelType,
  tmbId,
  ttlMs = CHANNEL_WRITE_LOCK_TTL_MS,
  waitTimeoutMs = CHANNEL_WRITE_LOCK_WAIT_TIMEOUT_MS,
  fn
}: ChannelWriteLockParams<T>): Promise<T> => {
  const channelOwner = channelType === 'team' ? `team:${tmbId}` : 'system';
  try {
    return await channelWriteLease.withConcurrency({
      key: `model-channel-write:${channelOwner}:${channelId}`,
      label: 'model-channel-write',
      concurrency: 1,
      ttlMs,
      waitTimeoutMs,
      fn
    });
  } catch (error) {
    if (!isRedisLeaseError(error)) throw error;

    // 避免把内部 Redis 锁键和成员 ID 透传给前端；Redis 故障保留 500 系统异常分类，并发争用归一为 409。
    if (error instanceof RedisLeaseAcquireError) {
      logger.error('Failed to acquire channel write lock', {
        channelId,
        channelType,
        tmbId,
        error
      });
      throw new ServerConfigError(ModelErrEnum.channelWriteBusy, undefined, { cause: error });
    }
    logger.warn('Channel write lock contention or lease lost', {
      channelId,
      channelType,
      tmbId,
      error
    });
    throw new UserError(ModelErrEnum.channelWriteBusy, undefined, { cause: error });
  }
};
