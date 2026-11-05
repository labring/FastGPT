import { z } from 'zod';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../../adapter';
import { getWorkflowStopSignalKey } from '../../caches/workflowStopSignal';
import { RedisInvalidArgumentError, RedisInvalidResponseError } from '../../runtime/errors';
import { parsePositiveInteger } from '../../runtime/validation';

const CHAT_GENERATION_LEASE_PREFIX = 'chat:generation:lease';

// 获取脚本只读出旧停止标记，不做删除：命令可能在调用方超时放行后才实际执行。
const ACQUIRE_CHAT_GENERATION_LEASE_SCRIPT = `
if not redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2], "NX") then return {0, redis.call("GET", KEYS[1])} end
return {1, redis.call("GET", KEYS[2])}
`;
const AcquireResponseSchema = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  z.string().nullable()
]);

export const ChatGenerationLeaseParamsSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  chatId: z.string().min(1)
});
export type ChatGenerationLeaseParams = z.infer<typeof ChatGenerationLeaseParamsSchema>;

export type ChatGenerationLeaseCacheOptions = {
  redis?: RedisCacheAdapter;
};

/** 构造会话生成租约 key；App 与其他对话来源通过 sourceType 隔离。 */
export const getChatGenerationLeaseKey = (params: ChatGenerationLeaseParams) => {
  const parsed = ChatGenerationLeaseParamsSchema.parse(params);
  // Mongo ObjectId 大小写等价，避免同一资源因请求参数大小写不同而查到另一条 lease。
  const sourceId = /^[0-9a-f]{24}$/i.test(parsed.sourceId)
    ? parsed.sourceId.toLowerCase()
    : parsed.sourceId;
  return asRedisLogicalKey(
    `${CHAT_GENERATION_LEASE_PREFIX}:${parsed.sourceType}:${sourceId}:${parsed.chatId}`
  );
};

/** 按会话管理生成租约；token 仅用于原子续租和释放，不进入业务数据。 */
export class ChatGenerationLeaseCache {
  private readonly redis: RedisCacheAdapter;

  constructor({ redis = redisCacheAdapter }: ChatGenerationLeaseCacheOptions = {}) {
    this.redis = redis;
  }

  /** 获取成功返回旧 stop 快照；明确占用时返回当前 lease 值，供上层解析恢复信息。 */
  async tryAcquire({
    params,
    token,
    ttlMs
  }: {
    params: ChatGenerationLeaseParams;
    token: string;
    ttlMs: number;
  }) {
    const operation = 'chatGenerationLease.acquire';
    if (typeof token !== 'string' || token.length === 0) {
      throw new RedisInvalidArgumentError({
        operation,
        message: 'token must be a non-empty string'
      });
    }
    const parsedTtlMs = parsePositiveInteger({ value: ttlMs, operation, field: 'ttlMs' });
    const result = await this.redis.evalScript({
      script: ACQUIRE_CHAT_GENERATION_LEASE_SCRIPT,
      keys: [getChatGenerationLeaseKey(params), getWorkflowStopSignalKey(params)],
      args: [token, parsedTtlMs]
    });
    const parsed = AcquireResponseSchema.safeParse(result);
    if (!parsed.success) {
      throw new RedisInvalidResponseError({
        operation,
        message: 'Redis chat generation lease acquire returned an unsupported response'
      });
    }
    const [acquired, snapshot] = parsed.data;
    return {
      acquired: acquired === 1,
      stopSignal: acquired === 1 ? snapshot : null,
      occupiedValue: acquired === 0 ? snapshot : null
    };
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

  /** 一次 MGET 读取同一资源下的会话租约；结果与 chatIds 一一对应，不暴露 Redis 客户端。 */
  async getTokens({
    sourceType,
    sourceId,
    chatIds
  }: Omit<ChatGenerationLeaseParams, 'chatId'> & { chatIds: readonly string[] }) {
    return this.redis.getMany(
      chatIds.map((chatId) => getChatGenerationLeaseKey({ sourceType, sourceId, chatId }))
    );
  }
}
