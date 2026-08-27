import {
  asRedisLogicalKey,
  redisCacheAdapter,
  type RedisCacheAdapter
} from '@fastgpt/dal/redis/adapter';

const suiteTicketKey = asRedisLogicalKey('wecom:suite_ticket');

export type WecomSuiteTicketCacheOptions = {
  redis?: RedisCacheAdapter;
};

/**
 * 企业微信 suite ticket Cache。
 *
 * suite ticket 由企业微信事件被动推送并永久保存，不得复用 access token 的 TTL。缺失、
 * Redis 读取失败或写入失败都保持 fail-closed。
 */
export class WecomSuiteTicketCache {
  private readonly redis: RedisCacheAdapter;

  constructor({ redis = redisCacheAdapter }: WecomSuiteTicketCacheOptions = {}) {
    this.redis = redis;
  }

  /** 获取当前 suite ticket；null 和历史空字符串都按缺失处理。 */
  async get() {
    const ticket = await this.redis.get(suiteTicketKey);
    if (!ticket) {
      throw new Error('Suite ticket not found');
    }
    return ticket;
  }

  /** 覆盖保存事件推送的 suite ticket，不设置过期时间。 */
  set = (ticket: string) =>
    this.redis.set({
      key: suiteTicketKey,
      value: ticket
    });
}

export const wecomSuiteTicketCache = new WecomSuiteTicketCache();
