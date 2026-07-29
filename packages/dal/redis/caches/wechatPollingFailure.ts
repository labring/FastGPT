import { z } from 'zod';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';

export const WECHAT_POLLING_FAILURE_TTL_SECONDS = 300;

const WECHAT_POLLING_FAILURE_NAMESPACE = 'cache:wechat:publish:failures';
const ShareIdSchema = z.string().min(1);

export type WechatPollingFailureCacheOptions = {
  redis?: Pick<RedisCacheAdapter, 'delete' | 'incrementIntegerWithTtl' | 'set'>;
};

/** 构造 Wechat polling failure counter 的逻辑 key，物理前缀由 Redis adapter 统一添加。 */
export const getWechatPollingFailureKey = (shareId: string) =>
  asRedisLogicalKey(`${WECHAT_POLLING_FAILURE_NAMESPACE}:${ShareIdSchema.parse(shareId)}`);

/**
 * Wechat polling failure counter Cache。
 *
 * 计数递增由 adapter 以 INCRBY + EXPIRE NX 事务完成，避免多个 worker 读取后写回时丢失更新。
 * Redis 错误不在 Cache 内吞掉，worker 继续沿用 failed/退避语义。
 */
export class WechatPollingFailureCache {
  private readonly redis: Pick<RedisCacheAdapter, 'delete' | 'incrementIntegerWithTtl' | 'set'>;

  constructor({ redis = redisCacheAdapter }: WechatPollingFailureCacheOptions = {}) {
    this.redis = redis;
  }

  getKey = getWechatPollingFailureKey;

  /** 原子递增连续失败次数；首次递增建立 300 秒 TTL，后续递增保留原 TTL。 */
  increment = (shareId: string) =>
    this.redis.incrementIntegerWithTtl({
      key: getWechatPollingFailureKey(shareId),
      increment: 1,
      ttlSeconds: WECHAT_POLLING_FAILURE_TTL_SECONDS
    });

  /** 成功轮询后将计数归零并刷新 300 秒 TTL，保持历史 value 合同。 */
  reset = (shareId: string) =>
    this.redis.set({
      key: getWechatPollingFailureKey(shareId),
      value: '0',
      ttlMs: WECHAT_POLLING_FAILURE_TTL_SECONDS * 1000
    });

  /** 达到阈值后删除计数 key；删除结果由调用方按需处理。 */
  clear = (shareId: string) => this.redis.delete(getWechatPollingFailureKey(shareId));
}

export const wechatPollingFailureCache = new WechatPollingFailureCache();
