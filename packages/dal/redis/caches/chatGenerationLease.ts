import { z } from 'zod';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';

const CHAT_GENERATION_LEASE_PREFIX = 'chat:generation:lease';

export const ChatGenerationLeaseParamsSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  chatId: z.string().min(1)
});
export type ChatGenerationLeaseParams = z.infer<typeof ChatGenerationLeaseParamsSchema>;

export type ChatGenerationLeaseCacheOptions = {
  redis?: RedisCacheAdapter;
};

/** 构造生成执行体 lease key；同一个 chat 同时只应存在一个 run 的 token。 */
export const getChatGenerationLeaseKey = (params: ChatGenerationLeaseParams) => {
  const parsed = ChatGenerationLeaseParamsSchema.parse(params);
  return asRedisLogicalKey(
    `${CHAT_GENERATION_LEASE_PREFIX}:${parsed.sourceType}:${parsed.sourceId}:${parsed.chatId}`
  );
};

/**
 * Chat generation lease。
 *
 * Mongo 的 chatGenerateStatus 负责业务状态和最终 CAS，Redis lease 只负责执行体存活与 token fencing。
 * start 覆盖旧 token，renew/release 必须携带当前 token，避免旧 run 误操作新 run。
 */
export class ChatGenerationLeaseCache {
  private readonly redis: RedisCacheAdapter;

  constructor({ redis = redisCacheAdapter }: ChatGenerationLeaseCacheOptions = {}) {
    this.redis = redis;
  }

  async start({
    params,
    token,
    ttlMs
  }: {
    params: ChatGenerationLeaseParams;
    token: string;
    ttlMs: number;
  }) {
    await this.redis.set({
      key: getChatGenerationLeaseKey(params),
      value: token,
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
