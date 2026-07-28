import { z } from 'zod';
import { asRedisLogicalKey, redisRepositoryAdapter, type RedisStoreAdapter } from '../adapter';
import { PositiveSafeIntegerSchema } from '../runtime/schema';

export const OUTLINK_STREAM_INITIAL_TTL_SECONDS = 120;
export const OUTLINK_STREAM_CONTENT_TTL_SECONDS = 60;
export const OUTLINK_STREAM_END_FLAG = '[DONE]';

const OUTLINK_STREAM_NAMESPACE = 'cache:streamResponse';

const StreamIdSchema = z.string().min(1);

export type OutLinkStreamRepositoryDependencies = {
  redis?: Pick<RedisStoreAdapter, 'appendStringWithTtl' | 'delete' | 'get'>;
};

/** 构造 OutLink 字符串响应缓存的逻辑 key，禁止业务层直接拼接 cache 前缀。 */
export const getOutLinkStreamKey = (streamId: string) =>
  asRedisLogicalKey(`${OUTLINK_STREAM_NAMESPACE}:${StreamIdSchema.parse(streamId)}`);

/**
 * 创建 OutLink Stream Repository。
 *
 * 该 Repository 保持 Wechat/Wecom 的字符串拼接协议；追加和 TTL 在同一 Redis 事务中执行，
 * 读取 miss 返回 undefined，删除结果由 adapter 透传。通道响应和加密编排留在调用方。
 */
export const createOutLinkStreamRepository = ({
  redis = redisRepositoryAdapter
}: OutLinkStreamRepositoryDependencies = {}) => {
  const parseTtlSeconds = (ttlSeconds: number) => PositiveSafeIntegerSchema.parse(ttlSeconds);

  return {
    getKey: getOutLinkStreamKey,

    /** 初始化或追加响应片段，并原子刷新对应 TTL。 */
    append: ({
      streamId,
      value,
      ttlSeconds
    }: {
      streamId: string;
      value: string;
      ttlSeconds: number;
    }) =>
      redis.appendStringWithTtl({
        key: getOutLinkStreamKey(streamId),
        value,
        ttlSeconds: parseTtlSeconds(ttlSeconds)
      }),

    /** 读取当前已拼接响应；Redis miss 映射为 undefined。 */
    async get(streamId: string) {
      const value = await redis.get(getOutLinkStreamKey(streamId));
      return value ?? undefined;
    },

    /** 删除已完成响应，保留 adapter 的删除结果以便调用方按需记录。 */
    delete: (streamId: string) => redis.delete(getOutLinkStreamKey(streamId))
  };
};

export type OutLinkStreamRepository = ReturnType<typeof createOutLinkStreamRepository>;

export const outLinkStreamRepository = createOutLinkStreamRepository();
