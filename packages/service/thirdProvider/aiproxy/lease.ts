import {
  LeaseCache,
  RedisLeaseUnavailableError,
  type RedisLeaseContext
} from '@fastgpt/dal/redis/caches';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../common/logger';

const channelLease = new LeaseCache({ logger: getLogger(LogCategories.INFRA.REDIS) });

/**
 * FastGPT 所有渠道写入口共用租约，获取后再读取渠道快照，减少全量 PUT 的读改写覆盖。
 * 不自动重试部分成功的操作；外部写入或已发出的迟到请求仍需要 AI Proxy CAS 才能完全隔离。
 */
export const withAIProxyChannelMutation = async <T>(
  fn: (context: RedisLeaseContext) => Promise<T>
) => {
  try {
    return await channelLease.withLease({
      key: 'aiproxy:channel-mutation',
      label: 'AI Proxy channels',
      ttlMs: 120000,
      fn
    });
  } catch (error) {
    if (error instanceof RedisLeaseUnavailableError) {
      throw new UserError('AI Proxy channels are being updated. Refresh and retry.');
    }
    throw error;
  }
};
