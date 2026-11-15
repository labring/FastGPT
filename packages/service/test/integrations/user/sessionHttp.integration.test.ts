import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import {
  createUserSession,
  delUserAllSession,
  sessionTokenCache,
  getUserSessionCount,
  authUserSession,
  rekeyUserSession
} from '@fastgpt/service/support/user/session';
import { SESSION_CONTEXT_HEADER } from '@fastgpt/global/support/user/session/constants';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import {
  refreshSessionHandler,
  sessionStatusHandler,
  logoutSessionHandler
} from '@fastgpt/service/support/user/account/session/controller';
import { createApiEntry } from '@fastgpt/service/common/http/entry';
import { apiI18n } from '@/service/middleware/i18n';
import { closeRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';
import {
  FASTGPT_WEB_REQUEST_HEADER,
  FASTGPT_WEB_REQUEST_VALUE
} from '@fastgpt/global/common/system/constants';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getSessionCookieNames } from '@fastgpt/service/support/user/session/http';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import type { IssuedSessionCredentials } from '@fastgpt/global/support/user/session/type';
import {
  createPasswordChangeSession,
  updatePassword
} from '@fastgpt/service/support/user/account/password/service';
import { withUserLock } from '@fastgpt/service/support/user/lock';
import { userSessionTokenService } from '@fastgpt/service/support/user/session';
import { UserSessionTokenService } from '@fastgpt/service/support/user/session/service';
import { SessionTokenCache } from '@fastgpt/dal/redis/caches/sessionToken';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';

describe('Session HTTP pipeline with real Mongo and Redis', () => {
  const runId = randomUUID();
  let server: Server;
  let baseUrl: string;
  let userId: string;
  let teamId: string;
  let tmbId: string;

  const cookie = (pair: IssuedSessionCredentials, includeAccess = true) => {
    const names = getSessionCookieNames(pair.session!.sessionId, pair.session!.contextVersion);
    return `fastgpt_session=${pair.session!.sessionId}; ${includeAccess ? `${names.access}=${pair.token}; ` : ''}${names.refresh}=${pair.refreshToken}`;
  };

  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        [FASTGPT_WEB_REQUEST_HEADER]: FASTGPT_WEB_REQUEST_VALUE,
        'content-type': 'application/json',
        origin: baseUrl,
        ...options.headers
      }
    });
    return { response, body: await response.json() };
  };

  beforeAll(async () => {
    const uri = process.env.SESSION_TEST_MONGODB_URI!;
    const databaseName = new URL(uri).pathname.slice(1);
    if (!databaseName.startsWith('fastgpt_session_test_'))
      throw new Error('Refusing a non-session-test Mongo database');
    await connectionMongo.connect(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 5 });
    const user = await MongoUser.create({
      username: `session-${runId}`,
      status: UserStatusEnum.active
    });
    const team = await MongoTeam.create({ name: `session-${runId}`, ownerId: user._id });
    const member = await MongoTeamMember.create({
      userId: user._id,
      teamId: team._id,
      name: 'Session tester',
      status: TeamMemberStatusEnum.active
    });
    userId = String(user._id);
    teamId = String(team._id);
    tmbId = String(member._id);
    const handlers = {
      '/refresh': createApiEntry({ requestI18n: apiI18n })(refreshSessionHandler),
      '/status': createApiEntry({ requestI18n: apiI18n })(sessionStatusHandler),
      '/logout': createApiEntry({ requestI18n: apiI18n })(logoutSessionHandler),
      '/business': createApiEntry({ requestI18n: apiI18n })(async (req) => {
        const cert = await authCert({ req, authToken: true });
        return { userId: cert.userId, sessionId: cert.sessionId, teamId: cert.teamId };
      }),
      '/root-business': createApiEntry({ requestI18n: apiI18n })(async (req) => ({
        isRoot: (await authCert({ req, authRoot: true })).isRoot
      })),
      '/key-business': createApiEntry({ requestI18n: apiI18n })(async (req) => ({
        userId: (await authCert({ req, authApiKey: true })).userId
      })),
      '/unavailable': createApiEntry({ requestI18n: apiI18n })(async (req) => {
        const client = new Redis(process.env.REDIS_INTEGRATION_URL!, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: true
        });
        try {
          await client.connect();
          await client.ping();
          // 只断开本次测试自己的连接，模拟实际传输故障，不停止远端 Redis。
          client.disconnect();
          const service = new UserSessionTokenService({
            secret: 'isolated-cache-failure',
            cache: new SessionTokenCache({
              redis: new RedisCacheAdapter({ getCommandClient: () => client })
            })
          });
          await service.auth(String(req.headers.token));
          return { executed: true };
        } finally {
          client.disconnect();
        }
      })
    };
    server = createServer(async (incoming, outgoing) => {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const req = incoming as NodeApiRequest;
      req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      req.query = {};
      const res = outgoing as NodeApiResponse;
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };
      const handler = handlers[req.url as keyof typeof handlers];
      if (!handler) {
        res.status(404).json({ code: 404 });
        return;
      }
      await handler(req, res);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (userId) await delUserAllSession(userId);
    if (connectionMongo.connection.readyState === 1) {
      await MongoTeamMember.deleteMany({ _id: tmbId });
      await MongoTeam.deleteMany({ _id: teamId });
      await MongoUser.deleteMany({ _id: userId });
      await MongoOpenApi.deleteMany({ teamId });
      await connectionMongo.disconnect();
    }
    await closeRedisRuntime();
  });

  beforeEach(async () => {
    await delUserAllSession(userId);
    await MongoUser.updateOne({ _id: userId }, { status: UserStatusEnum.active });
  });

  it('recovers without Access, writes two scoped HttpOnly cookies, and revokes via Refresh-only logout', async () => {
    const pair = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const status = await request('/status', { headers: { cookie: cookie(pair) } });
    expect(status.response.status).toBe(200);
    expect(status.body.data.session.sessionId).toBe(pair.session!.sessionId);
    const missing = await request('/business');
    expect(missing.response.status).toBe(401);
    expect(missing.body.statusText).toBe(SessionErrEnum.accessMissing);
    expect(missing.response.headers.getSetCookie()).toEqual([]);
    const renewed = await request('/refresh', {
      method: 'POST',
      body: '{}',
      headers: { cookie: cookie(pair, false) }
    });
    expect(renewed.response.status).toBe(200);
    expect(renewed.body.data.status).toBe('rotated');
    expect(renewed.body.data).not.toHaveProperty('token');
    expect(renewed.body.data).not.toHaveProperty('refreshToken');
    const cookies = renewed.response.headers.getSetCookie();
    expect(cookies.length).toBe(2);
    expect(/^fastgpt_access_[a-f0-9]{32}_1=at\./.test(cookies[0])).toBe(true);
    expect(cookies[0].includes('HttpOnly')).toBe(true);
    expect(/^fastgpt_refresh_[a-f0-9]{32}_1=rt\./.test(cookies[1])).toBe(true);
    expect(cookies[1].includes('Path=/api/support/user/account/session')).toBe(true);
    expect(cookies[1].includes('HttpOnly')).toBe(true);
    expect(renewed.response.headers.get('cache-control')).toBe('no-store');
    const refreshCookie = `fastgpt_session=${pair.session!.sessionId}; ${cookies[1].split(';')[0]}`;
    const logout = await request('/logout', {
      method: 'POST',
      body: '{}',
      headers: { cookie: refreshCookie }
    });
    expect(logout.response.status).toBe(200);
    expect(logout.response.headers.getSetCookie().length).toBeGreaterThanOrEqual(3);
    expect(logout.response.headers.getSetCookie().every((c) => c.includes('Max-Age=0'))).toBe(true);
    await expect(sessionTokenCache.get(pair.session!.sessionId)).resolves.toBeUndefined();
    const retry = await request('/refresh', {
      method: 'POST',
      body: '{}',
      headers: { cookie: refreshCookie }
    });
    expect(retry.response.status).toBe(401);
    expect(retry.body.statusText).toBe(SessionErrEnum.revoked);
    expect(retry.response.headers.getSetCookie()).toEqual([]);
  });

  it('enforces browser origin and RT transport while native clients receive the complete rotated pair', async () => {
    const pair = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const forged = await request('/refresh', {
      method: 'POST',
      body: '{}',
      headers: { origin: 'https://other.example', cookie: cookie(pair) }
    });
    expect(forged.response.status).toBe(403);
    expect(forged.body.statusText).toBe(SessionErrEnum.csrfInvalid);
    const invalidTransport = await request('/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: pair.refreshToken }),
      headers: { cookie: cookie(pair) }
    });
    expect(invalidTransport.body.statusText).toBe(SessionErrEnum.refreshInvalid);
    const wrongMethod = await request('/refresh', { headers: { cookie: cookie(pair) } });
    expect(wrongMethod.response.status).toBe(405);
    expect(wrongMethod.response.headers.get('allow')).toBe('POST');
    const native = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fastgpt-session-transport': 'header'
      },
      body: JSON.stringify({ refreshToken: pair.refreshToken })
    });
    expect(native.status).toBe(200);
    const result = (await native.json()).data;
    expect(/^at\./.test(result.token)).toBe(true);
    expect(/^rt\./.test(result.refreshToken)).toBe(true);
    expect(result.session.sessionId).toBe(pair.session!.sessionId);
    expect(await getUserSessionCount(userId)).toBe(1);
    const fresh = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fastgpt-session-transport': 'header',
        token: result.token
      },
      body: JSON.stringify({ refreshToken: result.refreshToken })
    });
    const freshData = (await fresh.json()).data;
    expect(freshData.status).toBe('fresh');
    expect(freshData.session.generation).toBe(result.session.generation);
    expect(freshData.session.refreshExpiresAt).toBe(result.session.refreshExpiresAt);
    expect(fresh.headers.getSetCookie()).toEqual([]);
  });

  it('refuses renewal after the real account is disabled and invalidates its existing Access', async () => {
    const pair = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    await MongoUser.updateOne({ _id: userId }, { status: UserStatusEnum.forbidden });
    const renewed = await request('/refresh', {
      method: 'POST',
      body: '{}',
      headers: { cookie: cookie(pair) }
    });
    expect(renewed.response.status).toBe(401);
    expect(renewed.body.statusText).toBe(SessionErrEnum.revoked);
    await expect(authUserSession(pair.token)).rejects.toThrow(SessionErrEnum.revoked);
  });

  it('returns one successor pair to concurrent HTTP refreshes instead of rejecting lock contenders', async () => {
    const pair = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const results = await Promise.all(
      Array.from({ length: 12 }, async () => {
        const response = await fetch(`${baseUrl}/refresh`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-fastgpt-session-transport': 'header'
          },
          body: JSON.stringify({ refreshToken: pair.refreshToken })
        });
        return { status: response.status, data: (await response.json()).data };
      })
    );
    expect(results.map((result) => result.status)).toEqual(Array(12).fill(200));
    expect(new Set(results.map((result) => result.data.token)).size).toBe(1);
    expect(new Set(results.map((result) => result.data.refreshToken)).size).toBe(1);
    expect(results.every((result) => result.data.session.generation === 2)).toBe(true);
    expect(await getUserSessionCount(userId)).toBe(1);
  });

  it('rejects old request contexts even when the browser already carries a newer valid Cookie pair', async () => {
    const original = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const next = await rekeyUserSession({ sessionId: original.session!.sessionId });
    const headers = {
      cookie: cookie(next),
      [SESSION_CONTEXT_HEADER]: `${original.session!.sessionId}.1`
    };
    const business = await request('/business', { headers });
    expect(business.response.status).toBe(409);
    expect(business.body.statusText).toBe(SessionErrEnum.contextChanged);
    expect(business.response.headers.getSetCookie()).toEqual([]);
    const refresh = await request('/refresh', { method: 'POST', body: '{}', headers });
    expect(refresh.response.status).toBe(409);
    expect(refresh.body.statusText).toBe(SessionErrEnum.contextChanged);
    const valid = await request('/business', {
      headers: {
        cookie: cookie(next),
        [SESSION_CONTEXT_HEADER]: `${next.session!.sessionId}.${next.session!.contextVersion}`
      }
    });
    expect(valid.response.status).toBe(200);
    expect((await sessionTokenCache.get(next.session!.sessionId))?.generation).toBe(
      next.session!.generation
    );
  });

  it('keeps password authorization across ordinary refresh and rekeys only the surviving device after a real password transaction', async () => {
    const original = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const other = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const authorization = await createPasswordChangeSession({
      userId,
      loginSessionId: original.session!.sessionId
    });
    const response = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fastgpt-session-transport': 'header'
      },
      body: JSON.stringify({ refreshToken: original.refreshToken })
    });
    expect(response.status).toBe(200);
    const refreshed = (await response.json()).data;
    const next = await withUserLock(userId, async () => {
      await updatePassword({
        sessionId: authorization.sessionId,
        userId,
        loginSessionId: refreshed.session.sessionId,
        newPassword: `password-${runId}`
      });
      await delUserAllSession(userId, [refreshed.session.sessionId]);
      return rekeyUserSession({ sessionId: refreshed.session.sessionId });
    });
    expect(next.session!.sessionId).toBe(original.session!.sessionId);
    expect(next.session!.createdAt).toBe(original.session!.createdAt);
    expect(next.session!.absoluteExpiresAt).toBe(original.session!.absoluteExpiresAt);
    expect(next.session!.contextVersion).toBe(2);
    await expect(authUserSession(other.token)).rejects.toThrow(SessionErrEnum.revoked);
    await expect(authUserSession(refreshed.token)).rejects.toThrow(SessionErrEnum.contextChanged);
    await expect(userSessionTokenService.verifyRefresh(refreshed.refreshToken)).rejects.toThrow(
      SessionErrEnum.contextChanged
    );
    await expect(authUserSession(next.token)).resolves.toMatchObject({ userId });
    await expect(
      updatePassword({
        sessionId: authorization.sessionId,
        userId,
        loginSessionId: next.session!.sessionId,
        newPassword: `another-${runId}`
      })
    ).rejects.toBeDefined();
    expect(await getUserSessionCount(userId)).toBe(1);
  });

  it('never revives a device when HTTP logout races an HTTP refresh using the same Refresh', async () => {
    const pair = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const headers = { 'content-type': 'application/json', 'x-fastgpt-session-transport': 'header' };
    const body = JSON.stringify({ refreshToken: pair.refreshToken });
    const [renewal, logout] = await Promise.all([
      fetch(`${baseUrl}/refresh`, { method: 'POST', headers, body }),
      fetch(`${baseUrl}/logout`, { method: 'POST', headers, body })
    ]);
    expect([200, 401]).toContain(renewal.status);
    expect(logout.status).toBe(200);
    await expect(sessionTokenCache.get(pair.session!.sessionId)).resolves.toBeUndefined();
    const retry = await fetch(`${baseUrl}/refresh`, { method: 'POST', headers, body });
    expect(retry.status).toBe(401);
    expect(await getUserSessionCount(userId)).toBe(0);
  });

  it.each(['refresh-cookie', 'access-header'] as const)(
    'rejects a queued %s logout after its security context changes under the user lock',
    async (transport) => {
      const original = await createUserSession({ userId, teamId, tmbId, isRoot: false });
      let notifyAuthenticated!: () => void;
      const authenticated = new Promise<void>((resolve) => {
        notifyAuthenticated = resolve;
      });
      const method = transport === 'refresh-cookie' ? 'authRefreshForRevocation' : 'auth';
      const authenticate = userSessionTokenService[method].bind(userSessionTokenService);
      const spy = vi.spyOn(userSessionTokenService, method).mockImplementation(async (token) => {
        const identity = await authenticate(token);
        notifyAuthenticated();
        return identity;
      });
      let pendingLogout!: ReturnType<typeof request>;
      try {
        const next = await withUserLock(userId, async () => {
          pendingLogout = request('/logout', {
            method: 'POST',
            body: '{}',
            headers: {
              ...(transport === 'refresh-cookie'
                ? { cookie: cookie(original, false) }
                : { token: original.token }),
              [SESSION_CONTEXT_HEADER]: `${original.session!.sessionId}.1`
            }
          });
          // 确保退出已通过锁外认证，再模拟改密或切团队持锁重签，稳定覆盖等待窗口。
          await authenticated;
          return rekeyUserSession({ sessionId: original.session!.sessionId });
        });
        const logout = await pendingLogout;
        expect(logout.response.status).toBe(409);
        expect(logout.body.statusText).toBe(SessionErrEnum.contextChanged);
        expect(logout.response.headers.getSetCookie()).toEqual([]);
        await expect(authUserSession(next.token)).resolves.toMatchObject({ userId });
        await expect(
          userSessionTokenService.verifyRefresh(next.refreshToken!)
        ).resolves.toMatchObject({
          userId
        });
        expect(await getUserSessionCount(userId)).toBe(1);
      } finally {
        spy.mockRestore();
      }
    }
  );

  it('does not let a late logout response remove the selector of a newer login', async () => {
    const original = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const logout = await request('/logout', {
      method: 'POST',
      body: '{}',
      headers: { cookie: cookie(original) }
    });
    expect(logout.response.status).toBe(200);
    const next = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const jar = new Map(
      cookie(next)
        .split('; ')
        .map((part) => {
          const index = part.indexOf('=');
          return [part.slice(0, index), part.slice(index + 1)];
        })
    );
    // 新登录已写入浏览器后，才应用旧退出响应的 Cookie 清理；顺序不应使新登录失效。
    for (const header of logout.response.headers.getSetCookie()) {
      if (header.includes('Max-Age=0')) jar.delete(header.slice(0, header.indexOf('=')));
    }
    const current = await request('/business', {
      headers: { cookie: Array.from(jar, ([key, value]) => `${key}=${value}`).join('; ') }
    });
    expect(current.response.status).toBe(200);
    expect(current.body.data.sessionId).toBe(next.session!.sessionId);
    await expect(sessionTokenCache.get(original.session!.sessionId)).resolves.toBeUndefined();
    const staleLogout = await request('/logout', {
      method: 'POST',
      body: '{}',
      headers: {
        cookie: cookie(next),
        [SESSION_CONTEXT_HEADER]: `${original.session!.sessionId}.1`
      }
    });
    expect(staleLogout.response.status).toBe(409);
    expect(staleLogout.response.headers.getSetCookie()).toEqual([]);
    await expect(authUserSession(next.token)).resolves.toMatchObject({ userId });
  });

  it('evicts the oldest stable device without leaving a Refresh capable of reviving it', async () => {
    const originalLimit = serviceEnv.MAX_LOGIN_SESSION;
    try {
      serviceEnv.MAX_LOGIN_SESSION = 2;
      const first = await createUserSession({ userId, teamId, tmbId, isRoot: false });
      const second = await createUserSession({ userId, teamId, tmbId, isRoot: false });
      const third = await createUserSession({ userId, teamId, tmbId, isRoot: false });
      await vi.waitFor(async () => expect(await getUserSessionCount(userId)).toBe(2));
      await expect(authUserSession(first.token)).rejects.toThrow(SessionErrEnum.revoked);
      await expect(authUserSession(second.token)).resolves.toMatchObject({
        sessionId: second.session!.sessionId
      });
      await expect(authUserSession(third.token)).resolves.toMatchObject({
        sessionId: third.session!.sessionId
      });
      const retry = await request('/refresh', {
        method: 'POST',
        body: '{}',
        headers: { cookie: cookie(first) }
      });
      expect(retry.response.status).toBe(401);
      expect(retry.body.statusText).toBe(SessionErrEnum.revoked);
      expect(await getUserSessionCount(userId)).toBe(2);
    } finally {
      serviceEnv.MAX_LOGIN_SESSION = originalLimit;
    }
  });

  it('reports a real Redis connection loss as an internal failure without clearing credentials or revoking the Session', async () => {
    const pair = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    const result = await request('/unavailable', { headers: { token: pair.token } });
    expect(result.response.status).toBe(500);
    expect(result.body.data?.executed).not.toBe(true);
    expect(Object.values(SessionErrEnum)).not.toContain(result.body.statusText);
    expect(result.response.headers.getSetCookie()).toEqual([]);
    await expect(authUserSession(pair.token)).resolves.toMatchObject({ userId });
  });

  it('keeps legacy remaining lifetime, counts both generations and preserves API Key / rootkey authentication', async () => {
    const enabled = serviceEnv.AUTH_DUAL_TOKEN_ENABLED;
    let legacy: IssuedSessionCredentials;
    try {
      serviceEnv.AUTH_DUAL_TOKEN_ENABLED = false;
      legacy = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    } finally {
      serviceEnv.AUTH_DUAL_TOKEN_ENABLED = enabled;
    }
    expect(legacy!.refreshToken).toBeUndefined();
    const legacyStatus = await request('/status', { headers: { token: legacy!.token } });
    expect(legacyStatus.body.data.session).toBeNull();
    const legacyClient = new Redis(process.env.REDIS_INTEGRATION_URL!, { maxRetriesPerRequest: 1 });
    try {
      const originalToken = legacy!.token;
      const originalCreatedAt = Date.now() - 6 * 86_400_000;
      await legacyClient.hset(`fastgpt:session:${originalToken}`, 'createdAt', originalCreatedAt);
      await legacyClient.pexpire(`fastgpt:session:${originalToken}`, 86_400_000);
      legacy = await rekeyUserSession({ sessionId: originalToken });
      expect(legacy.refreshToken).toBeUndefined();
      expect(legacy.session).toBeUndefined();
      expect((await authUserSession(legacy.token)).createdAt).toBe(originalCreatedAt);
      const remaining = await legacyClient.ttl(`fastgpt:session:${legacy.token}`);
      expect(remaining).toBeGreaterThan(86_390);
      expect(remaining).toBeLessThanOrEqual(86_400);
      await expect(authUserSession(originalToken)).rejects.toBe('unAuthorization');
    } finally {
      await legacyClient.quit();
    }
    const pair = await createUserSession({ userId, teamId, tmbId, isRoot: false });
    expect(await getUserSessionCount(userId)).toBe(2);
    const promotion = await request('/refresh', {
      method: 'POST',
      body: '{}',
      headers: { token: legacy!.token }
    });
    expect(promotion.body.statusText).toBe(SessionErrEnum.refreshInvalid);
    await delUserAllSession(userId, [pair.session!.sessionId]);
    expect(await getUserSessionCount(userId)).toBe(1);
    await expect(authUserSession(legacy!.token)).rejects.toBe('unAuthorization');
    await expect(authUserSession(pair.token)).resolves.toMatchObject({
      sessionId: pair.session!.sessionId
    });
    await expect(authUserSession(pair.session!.sessionId)).rejects.toBe('unAuthorization');
    const rtBusiness = await request('/business', { headers: { token: pair.refreshToken! } });
    expect(rtBusiness.response.status).toBe(401);
    const wrongRefresh = await request('/refresh', {
      method: 'POST',
      body: '{}',
      headers: { cookie: `fastgpt_refresh_token=${pair.token}` }
    });
    expect(wrongRefresh.body.statusText).toBe(SessionErrEnum.refreshInvalid);
    const apiKey = `fastgpt-session-test-${runId}`;
    await MongoOpenApi.create({ teamId, tmbId, apiKey, type: ApiKeyTypeEnum.personal });
    const keyResult = await request('/key-business', {
      headers: { authorization: `Bearer ${apiKey}` }
    });
    expect(keyResult.body.data.userId).toBe(userId);
    const rootResult = await request('/root-business', {
      headers: { rootkey: serviceEnv.ROOT_KEY }
    });
    expect(rootResult.body.data.isRoot).toBe(true);
  });
});
