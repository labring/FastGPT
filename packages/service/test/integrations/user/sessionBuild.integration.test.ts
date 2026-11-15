import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('session policy during Next production-build imports', () => {
  afterEach(async () => {
    const { closeRedisRuntime } = await import('@fastgpt/dal/redis/runtime');
    await closeRedisRuntime();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    { raw: undefined, access: 900, refresh: 604_800, absolute: 2_592_000 },
    { raw: ['', '', ''], access: 900, refresh: 604_800, absolute: 2_592_000 },
    { raw: ['1800', '3600', '7200'], access: 1800, refresh: 3600, absolute: 7200 }
  ])(
    'normalizes raw build-phase environment policy: $raw',
    async ({ raw, access, refresh, absolute }) => {
      vi.resetModules();
      vi.stubEnv('NEXT_PHASE', 'phase-production-build');
      vi.stubEnv('AUTH_ACCESS_TTL_SECONDS', raw?.[0]);
      vi.stubEnv('AUTH_REFRESH_TTL_SECONDS', raw?.[1]);
      vi.stubEnv('AUTH_SESSION_ABSOLUTE_TTL_SECONDS', raw?.[2]);
      // resetModules 会清除专项 setup 的运行时配置；每个隔离导入使用同一个独立测试 Redis DB。
      const { configureRedisRuntime } = await import('@fastgpt/dal/redis/runtime');
      const { serviceEnv } = await import('@fastgpt/service/env');
      // 构建阶段跳过 env 校验，真实导出仍是 undefined / string，不能假设有数字默认值。
      if (raw?.[0]) expect(serviceEnv.AUTH_ACCESS_TTL_SECONDS).toBe(raw[0]);
      else expect([undefined, '']).toContain(serviceEnv.AUTH_ACCESS_TTL_SECONDS);
      const { userSessionTokenService, sessionTokenCache } =
        await import('@fastgpt/service/support/user/session');
      configureRedisRuntime({ redisUrl: process.env.REDIS_INTEGRATION_URL! });
      const pair = await userSessionTokenService.create({
        userId: `build-policy-${randomUUID()}`,
        teamId: 'build-team',
        tmbId: 'build-member',
        isRoot: false
      });
      try {
        expect(pair.session.accessExpiresAt - pair.session.createdAt).toBe(access * 1000);
        expect(pair.session.refreshExpiresAt - pair.session.createdAt).toBe(refresh * 1000);
        expect(pair.session.absoluteExpiresAt - pair.session.createdAt).toBe(absolute * 1000);
      } finally {
        await sessionTokenCache.delete(pair.session.sessionId);
      }
    }
  );
});
