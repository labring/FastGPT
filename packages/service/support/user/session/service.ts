import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';
import { z } from 'zod';
import { SessionTokenCache, type SessionTokenData } from '@fastgpt/dal/redis/caches/sessionToken';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';
import {
  SESSION_ACCESS_TTL_SECONDS,
  SESSION_REFRESH_TTL_SECONDS,
  SESSION_ABSOLUTE_TTL_SECONDS,
  SESSION_PREFRESH_MS,
  SESSION_REFRESH_REPLAY_MS
} from '@fastgpt/global/support/user/session/constants';
import {
  SessionCredentialsSchema,
  type SessionCredentials,
  type SessionLifecycle
} from '@fastgpt/global/support/user/session/type';

export type UserSessionPolicy = {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  absoluteTtlSeconds: number;
  preRefreshMs: number;
  replayTtlMs: number;
};

/**
 * 双凭证认证核心，负责用途隔离、时间边界与原子轮换；账号 / 团队准入由调用层守卫。
 * 可注入时钟和 DAL，专项集成测试直接连接真实 Redis，不需要替换内部认证逻辑。
 */
export class UserSessionTokenService {
  private readonly cache: SessionTokenCache;
  private readonly encryptionKey: Buffer;
  private readonly now: () => number;
  private readonly policy: UserSessionPolicy;

  constructor({
    cache = new SessionTokenCache(),
    secret,
    now = Date.now,
    policy = {}
  }: {
    cache?: SessionTokenCache;
    secret: string;
    now?: () => number;
    policy?: Partial<UserSessionPolicy>;
  }) {
    this.cache = cache;
    this.encryptionKey = createHash('sha256')
      .update(`fastgpt/session/replay/v1:${secret}`)
      .digest();
    this.now = now;
    this.policy = {
      accessTtlSeconds: SESSION_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: SESSION_REFRESH_TTL_SECONDS,
      absoluteTtlSeconds: SESSION_ABSOLUTE_TTL_SECONDS,
      preRefreshMs: SESSION_PREFRESH_MS,
      replayTtlMs: SESSION_REFRESH_REPLAY_MS,
      ...policy
    };
    for (const value of Object.values(this.policy)) z.int().positive().parse(value);
    const extendableTtlMs =
      Math.min(this.policy.accessTtlSeconds, this.policy.refreshTtlSeconds) * 1000;
    if (
      extendableTtlMs < this.policy.absoluteTtlSeconds * 1000 &&
      extendableTtlMs < this.policy.preRefreshMs + this.policy.replayTtlMs
    ) {
      throw new Error('Extendable token lifetime must cover the pre-refresh and replay windows');
    }
  }

  /** 摘要覆盖完整 Token，公开定位字段或代次被修改后不能通过认证。 */
  private digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private matches(token: string, digest: string) {
    return timingSafeEqual(Buffer.from(this.digest(token), 'hex'), Buffer.from(digest, 'hex'));
  }

  /** 只解析路由与用途；解析成功不代表通过认证，后续必须验证摘要。 */
  private parseToken(token: string, purpose: 'at' | 'rt') {
    const match = /^(at|rt)\.([\w-]+:[\w-]+)\.([1-9]\d*)\.([1-9]\d*)\.([\w-]{43})$/.exec(token);
    if (
      !match ||
      match[1] !== purpose ||
      !Number.isSafeInteger(Number(match[3])) ||
      !Number.isSafeInteger(Number(match[4]))
    ) {
      throw new Error(
        purpose === 'at' ? SessionErrEnum.accessInvalid : SessionErrEnum.refreshInvalid
      );
    }
    return { sessionId: match[2], contextVersion: Number(match[3]), generation: Number(match[4]) };
  }

  /** 输出可公开的当前会话时间，Hash 和 Refresh 秘密不得透出业务响应。 */
  lifecycle(sessionId: string, data: SessionTokenData): SessionLifecycle {
    return {
      sessionId,
      serverTime: this.now(),
      createdAt: data.createdAt,
      accessExpiresAt: data.accessExpiresAt,
      refreshExpiresAt: data.refreshExpiresAt,
      absoluteExpiresAt: data.absoluteExpiresAt,
      generation: data.generation,
      contextVersion: data.contextVersion
    };
  }

  private mint(sessionId: string, data: SessionTokenData): SessionCredentials {
    const route = `${sessionId}.${data.contextVersion}.${data.generation}`;
    return {
      token: `at.${route}.${randomBytes(32).toString('base64url')}`,
      refreshToken: `rt.${route}.${randomBytes(32).toString('base64url')}`,
      session: this.lifecycle(sessionId, data)
    };
  }

  /** 短期幂等结果使用认证加密，绑定设备 ID，Redis 中不保存原始可用凭证。 */
  private seal(credentials: SessionCredentials) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(credentials.session.sessionId));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  private unseal(sessionId: string, envelope: string) {
    const buffer = Buffer.from(envelope, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, buffer.subarray(0, 12));
    decipher.setAAD(Buffer.from(sessionId));
    decipher.setAuthTag(buffer.subarray(12, 28));
    return SessionCredentialsSchema.parse(
      JSON.parse(
        Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8')
      )
    );
  }

  /** 创建新的设备登录。调用层完成账户验证后才能调用，随机 ID 从不复用。 */
  async create(identity: Pick<SessionTokenData, 'userId' | 'teamId' | 'tmbId' | 'isRoot' | 'ip'>) {
    const now = this.now();
    const sessionId = `${identity.userId}:${randomBytes(24).toString('base64url')}`;
    const absoluteExpiresAt = now + this.policy.absoluteTtlSeconds * 1000;
    const refreshExpiresAt = Math.min(
      now + this.policy.refreshTtlSeconds * 1000,
      absoluteExpiresAt
    );
    const data: SessionTokenData = {
      ...identity,
      createdAt: now,
      absoluteExpiresAt,
      refreshExpiresAt,
      accessExpiresAt: Math.min(now + this.policy.accessTtlSeconds * 1000, refreshExpiresAt),
      generation: 1,
      contextVersion: 1,
      accessHash: '0'.repeat(64),
      refreshHash: '0'.repeat(64)
    };
    const pair = this.mint(sessionId, data);
    data.accessHash = this.digest(pair.token);
    data.refreshHash = this.digest(pair.refreshToken);
    if (!(await this.cache.create({ sessionId, data }))) throw new Error('Session ID collision');
    return pair;
  }

  /** 验证业务 Access；普通续约保留上一代至原到期时间，敏感上下文变更不享受宽限。 */
  async auth(token: string) {
    const route = this.parseToken(token, 'at');
    const data = await this.cache.get(route.sessionId);
    if (!data) throw new Error(SessionErrEnum.revoked);
    const now = this.now();
    if (now >= data.refreshExpiresAt || now >= data.absoluteExpiresAt)
      throw new Error(SessionErrEnum.refreshExpired);
    if (route.contextVersion !== data.contextVersion)
      throw new Error(SessionErrEnum.contextChanged);
    const expiresAt = (() => {
      if (route.generation === data.generation && this.matches(token, data.accessHash))
        return data.accessExpiresAt;
      if (
        route.generation === data.generation - 1 &&
        data.previousAccessHash &&
        this.matches(token, data.previousAccessHash)
      )
        return data.previousAccessExpiresAt;
      throw new Error(SessionErrEnum.accessInvalid);
    })();
    if (expiresAt === undefined || now >= expiresAt) throw new Error(SessionErrEnum.accessExpired);
    return {
      ...data,
      sessionId: route.sessionId,
      accessGeneration: route.generation,
      authenticatedAccessExpiresAt: expiresAt
    };
  }

  /** 在数据库守卫与用户锁之前验证 Refresh 归属；旧值仍由原子兑换判断幂等窗口和重放。 */
  async verifyRefresh(refreshToken: string) {
    const route = this.parseToken(refreshToken, 'rt');
    const data = await this.cache.get(route.sessionId);
    if (!data) throw new Error(SessionErrEnum.revoked);
    if (route.contextVersion !== data.contextVersion)
      throw new Error(SessionErrEnum.contextChanged);
    if (
      !this.matches(refreshToken, data.refreshHash) &&
      !(await this.cache.wasConsumed({
        sessionId: route.sessionId,
        refreshHash: this.digest(refreshToken),
        contextVersion: data.contextVersion
      }))
    )
      throw new Error(SessionErrEnum.refreshInvalid);
    if (this.now() >= data.refreshExpiresAt || this.now() >= data.absoluteExpiresAt)
      throw new Error(SessionErrEnum.refreshExpired);
    return { ...data, sessionId: route.sessionId };
  }

  /** 撤销权限只接受当前 RT 或仍处于本轮恢复窗口的旧值，重放识别材料不构成登录权限。 */
  async authRefreshForRevocation(refreshToken: string) {
    const data = await this.verifyRefresh(refreshToken);
    if (
      !this.matches(refreshToken, data.refreshHash) &&
      !(await this.cache.isReplayProof({
        sessionId: data.sessionId,
        refreshHash: this.digest(refreshToken),
        generation: data.generation,
        contextVersion: data.contextVersion
      }))
    ) {
      throw new Error(SessionErrEnum.refreshInvalid);
    }
    return data;
  }

  /**
   * 改密或团队切换时轮换安全上下文，不新增设备，也不重置原登录和可续约上限。
   * 调用层必须事先校验当前登录主体及目标团队；CAS 失败表示同时刷新或上下文已变化。
   */
  async rekey({
    sessionId,
    teamId,
    tmbId
  }: {
    sessionId: string;
    teamId?: string;
    tmbId?: string;
  }) {
    const data = await this.cache.get(sessionId);
    if (!data) throw new Error(SessionErrEnum.revoked);
    const now = this.now();
    if (now >= data.refreshExpiresAt || now >= data.absoluteExpiresAt)
      throw new Error(SessionErrEnum.refreshExpired);
    const next: SessionTokenData = {
      ...data,
      teamId: teamId ?? data.teamId,
      tmbId: tmbId ?? data.tmbId,
      generation: data.generation + 1,
      contextVersion: data.contextVersion + 1,
      accessExpiresAt: Math.min(now + this.policy.accessTtlSeconds * 1000, data.refreshExpiresAt),
      previousAccessHash: undefined,
      previousAccessExpiresAt: undefined
    };
    const pair = this.mint(sessionId, next);
    next.accessHash = this.digest(pair.token);
    next.refreshHash = this.digest(pair.refreshToken);
    if (
      !(await this.cache.replace({
        sessionId,
        next,
        now,
        expectedGeneration: data.generation,
        expectedContextVersion: data.contextVersion
      }))
    ) {
      throw new Error(SessionErrEnum.contextChanged);
    }
    return pair;
  }

  /**
   * 验证 Refresh 并兑换唯一后继；RT 缺失或用途错误不允许回退到 Access。
   * 调用层在账号 / 团队守卫后执行；最终原子脚本再次检查撤销和版本，禁止创建已删除会话。
   */
  async refresh({ refreshToken, accessToken }: { refreshToken: string; accessToken?: string }) {
    const route = this.parseToken(refreshToken, 'rt');
    const data = await this.cache.get(route.sessionId);
    if (!data) throw new Error(SessionErrEnum.revoked);
    if (route.contextVersion !== data.contextVersion)
      throw new Error(SessionErrEnum.contextChanged);
    const now = this.now();
    const refreshExpiresAt = Math.min(
      now + this.policy.refreshTtlSeconds * 1000,
      data.absoluteExpiresAt
    );
    const next = {
      ...data,
      generation: data.generation + 1,
      refreshExpiresAt,
      accessExpiresAt: Math.min(now + this.policy.accessTtlSeconds * 1000, refreshExpiresAt)
    };
    const pair = this.mint(route.sessionId, next);
    next.accessHash = this.digest(pair.token);
    next.refreshHash = this.digest(pair.refreshToken);
    const result = await this.cache.rotate({
      sessionId: route.sessionId,
      refreshHash: this.digest(refreshToken),
      accessHash: accessToken ? this.digest(accessToken) : undefined,
      now,
      preRefreshMs: this.policy.preRefreshMs,
      replayTtlMs: this.policy.replayTtlMs,
      next,
      envelope: this.seal(pair)
    });
    if (result.data && result.status === 'fresh')
      return { status: 'fresh' as const, session: this.lifecycle(route.sessionId, result.data) };
    if (
      result.data &&
      result.envelope &&
      (result.status === 'rotated' || result.status === 'replayed')
    ) {
      const credentials = this.unseal(route.sessionId, result.envelope);
      credentials.session = this.lifecycle(route.sessionId, result.data);
      return { status: result.status, session: credentials.session, credentials };
    }
    const errors = {
      revoked: SessionErrEnum.revoked,
      expired: SessionErrEnum.refreshExpired,
      invalid: SessionErrEnum.refreshInvalid,
      reuse: SessionErrEnum.refreshReused,
      conflict: SessionErrEnum.contextChanged
    };
    throw new Error(errors[result.status as keyof typeof errors] ?? SessionErrEnum.refreshInvalid);
  }
}
