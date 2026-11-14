import { createRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';

export type LoginRiskScope = { account: string; ip: string };

/** 登录风险计数只存短期窗口，不保存密码、会话或永久设备指纹。故障策略由业务层决定。 */
export class LoginRiskCache {
  constructor(private readonly redis: RedisCacheAdapter = redisCacheAdapter) {}

  private key(kind: 'attempt' | 'failure', dimension: 'account' | 'ip', value: string) {
    return createRedisLogicalKey({ namespace: 'login-risk', segments: [kind, dimension, value] });
  }

  async recordAttempt({ account, ip }: LoginRiskScope) {
    const [byAccount, byIp] = await Promise.all([
      this.redis.consumeFixedWindow({
        key: this.key('attempt', 'account', account),
        windowSeconds: 60
      }),
      this.redis.consumeFixedWindow({ key: this.key('attempt', 'ip', ip), windowSeconds: 60 })
    ]);
    return { account: byAccount.currentCount, ip: byIp.currentCount };
  }

  async getFailures({ account, ip }: LoginRiskScope) {
    const [byAccount, byIp] = await Promise.all([
      this.redis.get(this.key('failure', 'account', account)),
      this.redis.get(this.key('failure', 'ip', ip))
    ]);
    // 非法缓存值提高风险，不能把 NaN、负数或溢出值当成“没有失败”。
    const parseCount = (value: string | null) => {
      const count = Number(value ?? 0);
      return Number.isSafeInteger(count) && count >= 0 ? count : Infinity;
    };
    return { account: parseCount(byAccount), ip: parseCount(byIp) };
  }

  async recordFailure({ account, ip }: LoginRiskScope) {
    await Promise.all([
      this.redis.consumeFixedWindow({
        key: this.key('failure', 'account', account),
        windowSeconds: 600
      }),
      this.redis.consumeFixedWindow({ key: this.key('failure', 'ip', ip), windowSeconds: 600 })
    ]);
  }
}

export const loginRiskCache = new LoginRiskCache();
