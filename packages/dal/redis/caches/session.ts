import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import { RedisInvalidArgumentError, RedisInvalidResponseError } from '../runtime/errors';
import { z } from 'zod';
import { NonNegativeSafeIntegerSchema } from '../runtime/schema';
import type { RedisCacheLogger } from '../types';

const SESSION_KEY_PREFIX = 'session:';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const UPDATE_EXISTING_SESSION_FIELD_SCRIPT = `
if redis.call("exists", KEYS[1]) == 0 then
  return 0
end
redis.call("hset", KEYS[1], ARGV[1], ARGV[2])
return 1
`;

/** Session 业务数据的类型和写入校验合同。 */
export const SessionDataSchema = z.object({
  userId: z.string().min(1),
  teamId: z.string().min(1),
  tmbId: z.string().min(1),
  isRoot: z.boolean(),
  isCancelling: z.boolean().default(false),
  createdAt: NonNegativeSafeIntegerSchema,
  ip: z.string().nullable().optional()
});
export type SessionData = z.infer<typeof SessionDataSchema>;
export type SessionDataInput = z.input<typeof SessionDataSchema>;

const SessionHashSchema = z.object({
  userId: z.string().min(1),
  teamId: z.string().min(1),
  tmbId: z.string().min(1),
  isRoot: z.enum(['0', '1']).transform((value) => value === '1'),
  isCancelling: z
    .enum(['0', '1'])
    .optional()
    .default('0')
    .transform((value) => value === '1'),
  createdAt: z.string().regex(/^\d+$/).transform(Number).pipe(NonNegativeSafeIntegerSchema),
  ip: z.string().optional()
});

export type SessionCacheOptions = {
  redis?: RedisCacheAdapter;
  logger: RedisCacheLogger;
};

export type SessionRecord = {
  sessionId: string;
  data: SessionData;
};

/**
 * 用户 Session Cache。
 *
 * Cache 保持历史 session hash key、字段编码和 7 天 TTL；Redis 只存认证态，读取
 * 错误向上抛出保持 fail-closed。损坏 hash 会被记录并尽力删除，避免后续请求重复解析。
 */
export class SessionCache {
  private readonly redis: RedisCacheAdapter;
  private readonly logger: RedisCacheLogger;

  constructor({ redis = redisCacheAdapter, logger }: SessionCacheOptions) {
    this.redis = redis;
    this.logger = logger;
  }

  private getKey = (sessionId: string) => asRedisLogicalKey(`${SESSION_KEY_PREFIX}${sessionId}`);
  private getUserPrefix = (userId: string) => asRedisLogicalKey(`${SESSION_KEY_PREFIX}${userId}`);

  private decodeHash = async ({
    logicalKey,
    sessionId,
    hash
  }: {
    logicalKey: ReturnType<typeof asRedisLogicalKey>;
    sessionId: string;
    hash: Record<string, string>;
  }): Promise<SessionData | undefined> => {
    if (Object.keys(hash).length === 0) return;

    const parsed = SessionHashSchema.safeParse(hash);
    if (parsed.success) return parsed.data;

    this.logger.error('Invalid Redis session record', {
      sessionId,
      issues: parsed.error.issues
    });
    await this.redis.delete(logicalKey).catch((error) => {
      this.logger.warn('Failed to delete invalid Redis session record', { sessionId, error });
    });
  };

  private readByLogicalKey = async ({
    logicalKey,
    sessionId
  }: {
    logicalKey: ReturnType<typeof asRedisLogicalKey>;
    sessionId: string;
  }) => {
    const hash = await this.redis.getHashAll(logicalKey);
    return this.decodeHash({ logicalKey, sessionId, hash });
  };

  /** 读取一个 session ID；miss 或损坏记录返回 undefined，Redis 错误继续向上抛出。 */
  get = (sessionId: string) =>
    this.readByLogicalKey({ logicalKey: this.getKey(sessionId), sessionId });

  /** 原子写入历史 session hash 并设置 7 天 TTL。 */
  async set({ sessionId, data }: { sessionId: string; data: SessionDataInput }) {
    const parsedData = SessionDataSchema.safeParse(data);
    if (!parsedData.success) {
      throw new RedisInvalidArgumentError({
        operation: 'session.set',
        message: 'session data is invalid'
      });
    }

    const { userId, teamId, tmbId, isRoot, isCancelling, createdAt, ip } = parsedData.data;
    await this.redis.setHashWithTtl({
      key: this.getKey(sessionId),
      fields: {
        userId,
        teamId,
        tmbId,
        isRoot: isRoot ? '1' : '0',
        isCancelling: isCancelling ? '1' : '0',
        createdAt: String(createdAt),
        ...(ip === undefined || ip === null ? {} : { ip })
      },
      ttlSeconds: SESSION_TTL_SECONDS
    });
  }

  /** 删除一个 session ID；调用方不需要知道物理 key。 */
  async delete(sessionId: string) {
    await this.redis.delete(this.getKey(sessionId));
  }

  /** 更新 Session 的注销状态快照，不刷新原有过期时间。 */
  async updateCancellation({
    sessionId,
    isCancelling
  }: {
    sessionId: string;
    isCancelling: boolean;
  }) {
    const result = await this.redis.evalScript({
      script: UPDATE_EXISTING_SESSION_FIELD_SCRIPT,
      keys: [this.getKey(sessionId)],
      args: ['isCancelling', isCancelling ? '1' : '0']
    });
    if (result !== 0 && result !== 1) {
      throw new RedisInvalidResponseError({
        operation: 'session.updateCancellation',
        message: 'Redis session cancellation update returned an unsupported response'
      });
    }
    return result === 1;
  }

  /** 分页扫描某个用户的全部 typed session，损坏记录会被尽力清理。 */
  async listByUser(userId: string): Promise<SessionRecord[]> {
    const records: SessionRecord[] = [];
    for await (const logicalKeys of this.redis.iterateByPrefix({
      prefix: this.getUserPrefix(userId)
    })) {
      const batch = await Promise.all(
        logicalKeys.map(async (logicalKey) => {
          const sessionId = logicalKey.slice(SESSION_KEY_PREFIX.length);
          const data = await this.readByLogicalKey({ logicalKey, sessionId });
          return data ? { sessionId, data } : undefined;
        })
      );
      records.push(...batch.filter((record): record is SessionRecord => record !== undefined));
    }
    return records;
  }

  /** 批量删除 session ID；空集合不获取 Redis connection。 */
  deleteMany = (sessionIds: readonly string[]) => {
    if (sessionIds.length === 0) return Promise.resolve();
    return this.redis.deleteMany(sessionIds.map(this.getKey));
  };
}
