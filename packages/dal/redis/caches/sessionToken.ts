import { z } from 'zod';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import { SessionDataSchema } from './session';
import { RedisInvalidResponseError } from '../runtime/errors';

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** 一个设备的稳定会话；凭证只保存摘要，原始登录时间不随刷新改变。 */
export const SessionTokenDataSchema = SessionDataSchema.extend({
  accessHash: DigestSchema,
  accessExpiresAt: z.int().nonnegative(),
  previousAccessHash: DigestSchema.optional(),
  previousAccessExpiresAt: z.int().nonnegative().optional(),
  refreshHash: DigestSchema,
  refreshExpiresAt: z.int().nonnegative(),
  absoluteExpiresAt: z.int().nonnegative(),
  generation: z.int().positive(),
  contextVersion: z.int().positive()
});
export type SessionTokenData = z.infer<typeof SessionTokenDataSchema>;

const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'data', ARGV[1])
redis.call('PEXPIREAT', KEYS[1], ARGV[2])
return 1
`;

const ROTATE_SCRIPT = `
local raw = redis.call('HGET', KEYS[1], 'data')
if not raw then return cjson.encode({status='revoked'}) end
local current = cjson.decode(raw)
local now = tonumber(ARGV[1])
if now >= current.refreshExpiresAt or now >= current.absoluteExpiresAt then
  redis.call('DEL', KEYS[1], KEYS[2])
  return cjson.encode({status='expired'})
end
local proof = ARGV[2]
if proof ~= current.refreshHash then
  local consumedContext = redis.call('HGET', KEYS[1], 'used:' .. proof)
  if not consumedContext or tonumber(consumedContext) ~= current.contextVersion then
    return cjson.encode({status='invalid'})
  end
  local replayRaw = redis.call('GET', KEYS[2])
  if replayRaw then
    local replay = cjson.decode(replayRaw)
    if replay.refreshHash == proof and replay.generation == current.generation
      and replay.contextVersion == current.contextVersion then
      return cjson.encode({status='replayed', data=current, envelope=replay.envelope})
    end
  end
  redis.call('DEL', KEYS[1], KEYS[2])
  return cjson.encode({status='reuse'})
end
if ARGV[3] == current.accessHash and current.accessExpiresAt - now > tonumber(ARGV[4]) then
  return cjson.encode({status='fresh', data=current})
end
-- 本轮幂等结果仍有效时不连续换代；绝对上限临近时 AT 也可能已经进入预刷新区间。
if current.accessExpiresAt > now then
  local replayRaw = redis.call('GET', KEYS[2])
  if replayRaw then
    local replay = cjson.decode(replayRaw)
    if replay.generation == current.generation and replay.contextVersion == current.contextVersion then
      if ARGV[3] == current.accessHash then
        return cjson.encode({status='fresh', data=current})
      end
      return cjson.encode({status='replayed', data=current, envelope=replay.envelope})
    end
  end
end
local next = cjson.decode(ARGV[5])
if next.contextVersion ~= current.contextVersion or next.generation ~= current.generation + 1 then
  return cjson.encode({status='conflict'})
end
if next.userId ~= current.userId or next.teamId ~= current.teamId or next.tmbId ~= current.tmbId
  or next.isRoot ~= current.isRoot or next.createdAt ~= current.createdAt
  or next.absoluteExpiresAt ~= current.absoluteExpiresAt then
  return cjson.encode({status='conflict'})
end
if next.accessExpiresAt <= now or next.accessExpiresAt > next.refreshExpiresAt
  or next.refreshExpiresAt > current.absoluteExpiresAt then
  return cjson.encode({status='conflict'})
end
next.previousAccessHash = current.accessHash
next.previousAccessExpiresAt = current.accessExpiresAt
local encodedNext = cjson.encode(next)
local replay = cjson.encode({refreshHash=proof, generation=next.generation,
  contextVersion=next.contextVersion, envelope=ARGV[6]})
redis.call('HSET', KEYS[1], 'data', encodedNext, 'used:' .. proof, current.contextVersion)
redis.call('PEXPIREAT', KEYS[1], next.refreshExpiresAt)
redis.call('SET', KEYS[2], replay, 'PX', ARGV[7])
return cjson.encode({status='rotated', data=next, envelope=ARGV[6]})
`;

const RotationResultSchema = z.object({
  status: z.enum([
    'rotated',
    'replayed',
    'fresh',
    'invalid',
    'revoked',
    'expired',
    'reuse',
    'conflict'
  ]),
  data: SessionTokenDataSchema.optional(),
  envelope: z.string().optional()
});
export type SessionTokenRotationResult = z.infer<typeof RotationResultSchema>;

const REPLACE_SCRIPT = `
local raw = redis.call('HGET', KEYS[1], 'data')
if not raw then return 0 end
local current = cjson.decode(raw)
local next = cjson.decode(ARGV[1])
local now = tonumber(ARGV[2])
if now >= current.refreshExpiresAt or now >= current.absoluteExpiresAt then return 0 end
if current.generation ~= tonumber(ARGV[3]) or current.contextVersion ~= tonumber(ARGV[4]) then return 0 end
if next.generation ~= current.generation + 1 or next.contextVersion ~= current.contextVersion + 1
  or next.userId ~= current.userId or next.isRoot ~= current.isRoot
  or next.createdAt ~= current.createdAt or next.absoluteExpiresAt ~= current.absoluteExpiresAt
  or next.refreshExpiresAt > current.refreshExpiresAt or next.accessExpiresAt > next.refreshExpiresAt
  or next.accessExpiresAt <= now then return 0 end
redis.call('HSET', KEYS[1], 'data', ARGV[1])
redis.call('PEXPIREAT', KEYS[1], next.refreshExpiresAt)
redis.call('DEL', KEYS[2])
return 1
`;

/**
 * 双凭证会话的 Redis 存储。主记录与短期幂等 Key 使用相同 hash tag，兼容同槽原子脚本。
 * 读取、解析和写入错误均上抛，认证不能在 Redis 异常时放行。
 */
export class SessionTokenCache {
  private readonly redis: RedisCacheAdapter;

  constructor({ redis = redisCacheAdapter }: { redis?: RedisCacheAdapter } = {}) {
    this.redis = redis;
  }

  private getKey = (sessionId: string) => {
    // ID 只能是安全路由字符，禁止调用方注入 hash tag 或 SCAN glob。
    if (!/^[\w-]+:[\w-]+$/.test(sessionId)) throw new Error('Invalid stable session ID');
    return asRedisLogicalKey(`session-token:{${sessionId}}`);
  };

  private getReplayKey = (sessionId: string) => {
    this.getKey(sessionId);
    return asRedisLogicalKey(`session-token-replay:{${sessionId}}`);
  };

  /** 只创建不存在的设备会话，绝不覆盖已有会话或重新使用旧 ID。 */
  async create({ sessionId, data }: { sessionId: string; data: SessionTokenData }) {
    const parsed = SessionTokenDataSchema.parse(data);
    const result = await this.redis.evalScript({
      script: CREATE_SCRIPT,
      keys: [this.getKey(sessionId)],
      args: [JSON.stringify(parsed), Math.min(parsed.refreshExpiresAt, parsed.absoluteExpiresAt)]
    });
    return result === 1;
  }

  /** 读取会话；缺失返回 undefined，损坏数据作为基础设施异常上报。 */
  async get(sessionId: string): Promise<SessionTokenData | undefined> {
    const raw = await this.redis.evalScript({
      script: "return redis.call('HGET', KEYS[1], 'data')",
      keys: [this.getKey(sessionId)]
    });
    if (raw === null) return;
    try {
      if (typeof raw !== 'string') throw new Error('Invalid Redis response');
      return SessionTokenDataSchema.parse(JSON.parse(raw));
    } catch {
      throw new RedisInvalidResponseError({
        operation: 'sessionToken.get',
        message: 'Invalid session data'
      });
    }
  }

  /** 验证旧 RT 是否确由当前安全上下文消费过，公开 ID 或随机摘要不能获得刷新身份。 */
  async wasConsumed({
    sessionId,
    refreshHash,
    contextVersion
  }: {
    sessionId: string;
    refreshHash: string;
    contextVersion: number;
  }) {
    return (
      (await this.redis.evalScript({
        script: "return redis.call('HGET', KEYS[1], 'used:' .. ARGV[1]) == ARGV[2] and 1 or 0",
        keys: [this.getKey(sessionId)],
        args: [DigestSchema.parse(refreshHash), z.int().positive().parse(contextVersion)]
      })) === 1
    );
  }

  /** 旧 RT 只在当前幂等窗口内可作为撤销操作的身份凭证，历史消费记录不授予权限。 */
  async isReplayProof({
    sessionId,
    refreshHash,
    generation,
    contextVersion
  }: {
    sessionId: string;
    refreshHash: string;
    generation: number;
    contextVersion: number;
  }) {
    return (
      (await this.redis.evalScript({
        script: `local raw = redis.call('GET', KEYS[1])
        if not raw then return 0 end
        local data = cjson.decode(raw)
        return data.refreshHash == ARGV[1] and data.generation == tonumber(ARGV[2])
          and data.contextVersion == tonumber(ARGV[3]) and 1 or 0`,
        keys: [this.getReplayKey(sessionId)],
        args: [
          DigestSchema.parse(refreshHash),
          z.int().positive().parse(generation),
          z.int().positive().parse(contextVersion)
        ]
      })) === 1
    );
  }

  /**
   * 用 Refresh 摘要原子兑换唯一后继；同一旧值的短期重试返回同一加密结果。
   * known-used 摘要保存在主会话中；随机无效值或旧上下文值不触发撤销，避免被用于踢人。
   */
  async rotate({
    sessionId,
    refreshHash,
    accessHash,
    now,
    preRefreshMs,
    replayTtlMs,
    next,
    envelope
  }: {
    sessionId: string;
    refreshHash: string;
    accessHash?: string;
    now: number;
    preRefreshMs: number;
    replayTtlMs: number;
    next: SessionTokenData;
    envelope: string;
  }): Promise<SessionTokenRotationResult> {
    const result = await this.redis.evalScript({
      script: ROTATE_SCRIPT,
      keys: [this.getKey(sessionId), this.getReplayKey(sessionId)],
      args: [
        z.int().nonnegative().parse(now),
        DigestSchema.parse(refreshHash),
        accessHash === undefined ? '' : DigestSchema.parse(accessHash),
        z.int().nonnegative().parse(preRefreshMs),
        JSON.stringify(SessionTokenDataSchema.parse(next)),
        z.string().min(1).parse(envelope),
        z.int().positive().parse(replayTtlMs)
      ]
    });
    if (typeof result !== 'string')
      throw new RedisInvalidResponseError({
        operation: 'sessionToken.rotate',
        message: 'Invalid rotation response'
      });
    return RotationResultSchema.parse(JSON.parse(result));
  }

  /** 安全轮换 / 切团队原子替换上下文；保留原始设备身份和绝对上限，删除旧刷新恢复结果。 */
  async replace({
    sessionId,
    next,
    now,
    expectedGeneration,
    expectedContextVersion
  }: {
    sessionId: string;
    next: SessionTokenData;
    now: number;
    expectedGeneration: number;
    expectedContextVersion: number;
  }) {
    return (
      (await this.redis.evalScript({
        script: REPLACE_SCRIPT,
        keys: [this.getKey(sessionId), this.getReplayKey(sessionId)],
        args: [
          JSON.stringify(SessionTokenDataSchema.parse(next)),
          z.int().nonnegative().parse(now),
          z.int().positive().parse(expectedGeneration),
          z.int().positive().parse(expectedContextVersion)
        ]
      })) === 1
    );
  }

  /** 撤销整个设备会话并删除其短期刷新结果。 */
  async delete(sessionId: string) {
    await this.redis.deleteMany([this.getKey(sessionId), this.getReplayKey(sessionId)]);
  }

  /** 按稳定用户前缀枚举设备，辅助 Key 使用独立命名空间，不计入设备数量。 */
  async listByUser(userId: string) {
    if (!/^[\w-]+$/.test(userId)) throw new Error('Invalid session user ID');
    const result: { sessionId: string; data: SessionTokenData }[] = [];
    for await (const keys of this.redis.iterateByPrefix({
      prefix: asRedisLogicalKey(`session-token:{${userId}`)
    })) {
      for (const key of keys) {
        const sessionId = key.slice('session-token:{'.length, -1);
        const data = await this.get(sessionId);
        if (data) result.push({ sessionId, data });
      }
    }
    return result;
  }
}
