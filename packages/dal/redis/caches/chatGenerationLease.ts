import { z } from 'zod';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';

const CHAT_GENERATION_RUNNER_PREFIX = 'chat:generation:runner';

export const ChatGenerationLeaseParamsSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  chatId: z.string().min(1)
});
export type ChatGenerationLeaseParams = z.infer<typeof ChatGenerationLeaseParamsSchema>;

export type ChatGenerationLeaseCacheOptions = {
  redis?: RedisCacheAdapter;
};

/** 构造生成 runner lease key；同一个 chat 同时只允许一个 runner token。 */
export const getChatGenerationLeaseKey = (params: ChatGenerationLeaseParams) => {
  const parsed = ChatGenerationLeaseParamsSchema.parse(params);
  return asRedisLogicalKey(
    `${CHAT_GENERATION_RUNNER_PREFIX}:${parsed.sourceType}:${parsed.sourceId}:${parsed.chatId}`
  );
};

/**
 * Chat generation runner lease。
 *
 * Redis token 是 runner 存活和所有权的唯一真源；Mongo 状态只用于展示和持久化 fencing。
 * acquire 使用 SET NX，绝不覆盖已有 runner。
 */
export class ChatGenerationLeaseCache {
  private readonly redis: RedisCacheAdapter;

  constructor({ redis = redisCacheAdapter }: ChatGenerationLeaseCacheOptions = {}) {
    this.redis = redis;
  }

  async tryAcquire({
    params,
    token,
    ttlMs
  }: {
    params: ChatGenerationLeaseParams;
    token: string;
    ttlMs: number;
  }): Promise<boolean> {
    return this.redis.acquireLease({
      key: getChatGenerationLeaseKey(params),
      token,
      ttlMs
    });
  }

  async renew({
    params,
    token,
    ttlMs
  }: {
    params: ChatGenerationLeaseParams;
    token: string;
    ttlMs: number;
  }) {
    return this.redis.renewLease({
      key: getChatGenerationLeaseKey(params),
      token,
      ttlMs
    });
  }

  async release({ params, token }: { params: ChatGenerationLeaseParams; token: string }) {
    return this.redis.releaseLease({
      key: getChatGenerationLeaseKey(params),
      token
    });
  }

  async getToken(params: ChatGenerationLeaseParams) {
    return this.redis.get(getChatGenerationLeaseKey(params));
  }
}
