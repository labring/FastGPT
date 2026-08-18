import { z } from 'zod';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import { PositiveSafeIntegerSchema } from '../runtime/schema';

export const OUTLINK_STREAM_INITIAL_TTL_SECONDS = 120;
export const OUTLINK_STREAM_CONTENT_TTL_SECONDS = 60;
export const OUTLINK_STREAM_END_FLAG = '[DONE]';

const OUTLINK_STREAM_NAMESPACE = 'cache:streamResponse';

const StreamIdSchema = z.string().min(1);

export type OutLinkStreamCacheOptions = {
  redis?: RedisCacheAdapter;
};

/** 构造 OutLink 字符串响应缓存的逻辑 key，禁止业务层直接拼接 cache 前缀。 */
export const getOutLinkStreamKey = (streamId: string) =>
  asRedisLogicalKey(`${OUTLINK_STREAM_NAMESPACE}:${StreamIdSchema.parse(streamId)}`);

/**
 * OutLink Stream Cache。
 *
 * 该 Cache 保持 Wechat/Wecom 的字符串拼接协议；首次初始化使用 SET NX 避免重复 callback
 * 覆盖已有内容，追加和 TTL 在同一 Redis 事务中执行。读取 miss 返回 undefined，删除结果
 * 由 adapter 透传。通道响应和加密编排留在调用方。
 */
export class OutLinkStreamCache {
  private readonly redis: RedisCacheAdapter;

  constructor({ redis = redisCacheAdapter }: OutLinkStreamCacheOptions = {}) {
    this.redis = redis;
  }

  getKey = getOutLinkStreamKey;

  private parseTtlSeconds = (ttlSeconds: number) => PositiveSafeIntegerSchema.parse(ttlSeconds);

  /** 原子创建空流；已存在时不覆盖内容，并返回 false。 */
  initializeIfAbsent = ({ streamId, ttlSeconds }: { streamId: string; ttlSeconds: number }) =>
    this.redis.setIfAbsent({
      key: getOutLinkStreamKey(streamId),
      value: '',
      ttlSeconds: this.parseTtlSeconds(ttlSeconds)
    });

  /** 初始化或追加响应片段，并原子刷新对应 TTL。 */
  append = ({
    streamId,
    value,
    ttlSeconds
  }: {
    streamId: string;
    value: string;
    ttlSeconds: number;
  }) =>
    this.redis.appendStringWithTtl({
      key: getOutLinkStreamKey(streamId),
      value,
      ttlSeconds: this.parseTtlSeconds(ttlSeconds)
    });

  /** 读取当前已拼接响应；Redis miss 映射为 undefined。 */
  async get(streamId: string) {
    const value = await this.redis.get(getOutLinkStreamKey(streamId));
    return value ?? undefined;
  }

  /** 删除已完成响应，保留 adapter 的删除结果以便调用方按需记录。 */
  delete = (streamId: string) => this.redis.delete(getOutLinkStreamKey(streamId));
}

export const outLinkStreamCache = new OutLinkStreamCache();
