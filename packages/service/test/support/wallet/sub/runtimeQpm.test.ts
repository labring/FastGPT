import '@test/mocks/common/redis';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { asRedisLogicalKey, redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { teamQpmCache } from '@fastgpt/dal/redis/caches/teamQpm';

// 全局 setup 会预加载钱包模块；保持真实消费者，同时让其依赖重新绑定到本文件的内存 Model。
vi.hoisted(() => vi.resetModules());

const fixture = vi.hoisted(() => ({
  plans: new Map<string, Record<string, any>[]>(),
  created: vi.fn(),
  reads: vi.fn()
}));
// Cache 默认在构造时捕获 Date.now；显式使用其时钟注入口对齐后续 fake Date，不替换计数/决策。
vi.mock('@fastgpt/dal/redis/caches', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/dal/redis/caches')>();
  return { ...actual, rateLimitCache: new actual.RateLimitCache({ now: () => Date.now() }) };
});
vi.mock('@fastgpt/service/support/wallet/sub/schema', () => ({
  MongoTeamSub: {
    find: ({ teamId }: { teamId: string }) => ({
      lean: async () => {
        fixture.reads(teamId);
        return fixture.plans.get(teamId) ?? [];
      }
    }),
    findOne: async () => null,
    create: async (plans: Record<string, any>[]) => {
      for (const plan of plans) {
        fixture.plans.set(plan.teamId, [...(fixture.plans.get(plan.teamId) ?? []), plan]);
        fixture.created(plan.teamId);
      }
      return plans;
    }
  }
}));
vi.mock('@fastgpt/service/common/mongo/utils', () => ({
  readFromSecondary: { readPreference: 'secondaryPreferred' }
}));
vi.mock('@fastgpt/service/common/response', () => ({ jsonRes: vi.fn() }));

import { teamQPM } from '@fastgpt/service/support/wallet/sub/utils';
import {
  assertTeamFrequencyLimit,
  LimitTypeEnum
} from '@fastgpt/service/common/api/frequencyLimit';

const ownedTeams: string[] = [];
const newTeam = () => {
  const teamId = `qpm-owned-${randomUUID()}`;
  ownedTeams.push(teamId);
  return teamId;
};
const consume = (teamId: string) => assertTeamFrequencyLimit({ teamId, type: LimitTypeEnum.chat });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  vi.clearAllMocks();
  fixture.plans.clear();
  vi.stubGlobal('systemInstanceConfig', resolveSystemInstanceConfig({}));
});
afterEach(async () => {
  // 只删本文件 nonce team 的内存键，不清理共享测试 Redis 的其他业务数据。
  for (const teamId of ownedTeams.splice(0)) {
    await teamQPM.clearTeamQPMLimitCache(teamId);
    for (const key of [
      `rate-limit:team:chat-qpm:team:${teamId}`,
      `cache:team_point_total:${teamId}`,
      `cache:team_point_surplus:${teamId}`
    ])
      await redisCacheAdapter.delete(asRedisLogicalKey(key));
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('chat maxQpm runtime fallback and actual limiter consumption', () => {
  it('reads A/B fallback on cache misses without effective plans and enforces N/N+1 in one 60-second window', async () => {
    const snapshot = global.systemInstanceConfig!;
    snapshot.commercial.subPlans = undefined;
    const uncached = newTeam();
    for (const limit of [2, 3]) {
      snapshot.performance.chat.maxQpm = limit;
      expect(await teamQpmCache.getCachedLimit(uncached)).toBeNull();
      expect(await teamQPM.getTeamQPMLimit(uncached)).toBe(limit);
      // 初始化普通 free 订阅是真实业务分支，但没有套餐配置，不能凭它覆盖实例 fallback。
      expect(await teamQpmCache.getCachedLimit(uncached)).toBeNull();
      const teamId = newTeam();
      for (let count = 1; count <= limit; count++)
        expect(await consume(teamId)).toMatchObject({ limit, remaining: limit - count });
      await expect(consume(teamId)).rejects.toMatchObject({ message: ERROR_ENUM.tooManyRequest });
      const beforeReset = Date.now();
      vi.setSystemTime(beforeReset + 1000);
      await expect(consume(teamId)).rejects.toMatchObject({ message: ERROR_ENUM.tooManyRequest });
      vi.setSystemTime(beforeReset + 60_001);
      expect(await consume(teamId)).toMatchObject({
        limit,
        remaining: limit - 1,
        resetAt: Date.now() + 60_000
      });
    }
    expect(fixture.created.mock.calls.filter(([teamId]) => teamId === uncached)).toHaveLength(1);
  });

  it('prefers an effective plan and retains its cached quota until explicit invalidation', async () => {
    const snapshot = global.systemInstanceConfig!;
    snapshot.performance.chat.maxQpm = 1;
    snapshot.commercial.subPlans = {
      standard: {
        free: {
          price: 0,
          totalPoints: 100,
          maxTeamMember: 1,
          maxAppAmount: 1,
          maxDatasetAmount: 1,
          maxDatasetSize: 1,
          chatHistoryStoreDuration: 1,
          requestsPerMinute: 4
        }
      }
    };
    const teamId = newTeam();
    expect(await teamQPM.getTeamQPMLimit(teamId)).toBe(4);
    const reads = fixture.reads.mock.calls.length;
    snapshot.commercial.subPlans.standard!.free!.requestsPerMinute = 9;
    expect(await teamQPM.getTeamQPMLimit(teamId)).toBe(4);
    expect(fixture.reads).toHaveBeenCalledTimes(reads);
    await teamQPM.clearTeamQPMLimitCache(teamId);
    expect(await teamQPM.getTeamQPMLimit(teamId)).toBe(9);
  });

  it('treats zero fallback as unlimited without incrementing a rate-limit counter', async () => {
    global.systemInstanceConfig!.performance.chat.maxQpm = 0;
    global.systemInstanceConfig!.commercial.subPlans = undefined;
    const teamId = newTeam();
    expect(await consume(teamId)).toEqual({});
    expect(
      await redisCacheAdapter.get(asRedisLogicalKey(`rate-limit:team:chat-qpm:team:${teamId}`))
    ).toBeNull();
  });
});
