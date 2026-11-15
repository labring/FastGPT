import { createProfileService } from '../../src/domain/profile/profile-service';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFileConfigRepository } from '../../src/infra/config/config-repository';
import { createDefaultSecretStore } from '../../src/infra/secrets/secret-store';
import { createFastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';
import { createSessionAwareClient } from '../../src/domain/auth/session-client';
import {
  decodeSessionCredential,
  encodeSessionCredential
} from '../../src/domain/auth/session-credentials';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';
import type { SessionLifecycle } from '@fastgpt/global/support/user/session/type';
import { CliNetworkError } from '../../src/shared/errors';

describe('CLI persisted dual-token session client', () => {
  const directories: string[] = [];
  const lifecycle = (): SessionLifecycle => ({
    sessionId: 'user:device',
    serverTime: Date.now(),
    createdAt: Date.now(),
    accessExpiresAt: Date.now() + 30_000,
    refreshExpiresAt: Date.now() + 604_800_000,
    absoluteExpiresAt: Date.now() + 2_592_000_000,
    generation: 1,
    contextVersion: 1
  });
  const initial = () => ({
    authType: 'token' as const,
    secret: `at.user:device.1.1.${'a'.repeat(43)}`,
    refreshToken: `rt.user:device.1.1.${'b'.repeat(43)}`,
    session: lifecycle()
  });

  const makeStores = async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-session-'));
    directories.push(configDir);
    const configRepo = createFileConfigRepository({ configDir });
    const secretStore = createDefaultSecretStore({
      configDir,
      env: { FASTGPT_SECRET_STORE: 'file' }
    });
    await configRepo.write({
      schemaVersion: 1,
      currentProfile: 'default',
      profiles: {
        default: { baseUrl: 'https://fastgpt.test/api', authType: 'token', updatedAt: Date.now() }
      }
    });
    return { configDir, configRepo, secretStore };
  };

  afterEach(async () => {
    for (const directory of directories.splice(0))
      await rm(directory, { recursive: true, force: true });
  });

  it.each(['switch', 'baseUrl'] as const)(
    'serializes profile %s with a delayed automatic refresh',
    async (mutation) => {
      const stores = await makeStores();
      const { config } = await stores.configRepo.read();
      await stores.configRepo.write({
        ...config,
        profiles: {
          ...config.profiles,
          prod: { baseUrl: 'https://prod.fastgpt.test/api', updatedAt: Date.now() }
        }
      });
      const auth = initial();
      await stores.secretStore.setSecret('default', encodeSessionCredential(auth));
      let release!: () => void;
      let arrived!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const next = {
        token: `at.user:device.1.2.${'c'.repeat(43)}`,
        refreshToken: `rt.user:device.1.2.${'d'.repeat(43)}`,
        session: { ...auth.session, generation: 2, accessExpiresAt: Date.now() + 900_000 }
      };
      const client = createSessionAwareClient({
        ...stores,
        profileName: 'default',
        client: createFastGptHttpClient({
          baseUrl: 'https://fastgpt.test/api',
          cliVersion: 'test',
          fetchFn: async (input) => {
            if ((input as Request).url.endsWith('/session/refresh')) {
              arrived();
              await held;
              return Response.json({ code: 200, data: { status: 'rotated', ...next } });
            }
            return Response.json({ code: 200, data: { ok: true } });
          }
        })
      });
      const reading = vi.spyOn(stores.configRepo, 'read');
      const refreshing = client.request({ method: 'GET', path: '/whoami', auth });
      await started;
      const priorReads = reading.mock.calls.length;
      const service = createProfileService({ configRepo: stores.configRepo, env: {} });
      const changing =
        mutation === 'switch'
          ? service.switchProfile({ targetName: 'prod' })
          : service.setConfigValue({
              global: {
                allowInsecureHttp: false,
                insecure: false,
                format: 'json',
                quiet: true,
                color: false,
                raw: false
              },
              key: 'baseUrl',
              rawValue: 'https://updated.fastgpt.test/api'
            });
      try {
        // 配置修改也必须先取得锁，不能在刷新等待网络时读出即将过期的整份快照。
        expect(reading.mock.calls.length).toBe(priorReads);
      } finally {
        release();
        await Promise.allSettled([refreshing, changing]);
        reading.mockRestore();
      }
      await expect(refreshing).resolves.toEqual({ ok: true });
      await expect(changing).resolves.toMatchObject({ changed: true });
      const saved = (await stores.configRepo.read()).config;
      expect(mutation === 'switch' ? saved.currentProfile : saved.profiles.default.baseUrl).toBe(
        mutation === 'switch' ? 'prod' : 'https://updated.fastgpt.test/api'
      );
      expect(saved.profiles.default.accessExpiresAt).toBe(next.session.accessExpiresAt);
    }
  );

  it('re-reads under a shared file lock so concurrent clients refresh once and save one complete pair', async () => {
    const stores = await makeStores();
    const auth = initial();
    await stores.secretStore.setSecret('default', encodeSessionCredential(auth));
    let refreshes = 0;
    const received: string[] = [];
    const next = {
      token: `at.user:device.1.2.${'c'.repeat(43)}`,
      refreshToken: `rt.user:device.1.2.${'d'.repeat(43)}`,
      session: { ...auth.session, generation: 2, accessExpiresAt: Date.now() + 900_000 }
    };
    const baseClient = createFastGptHttpClient({
      baseUrl: 'https://fastgpt.test/api',
      cliVersion: 'test',
      fetchFn: async (input) => {
        const request = input as Request;
        if (request.url.endsWith('/session/refresh')) {
          refreshes++;
          expect(request.headers.get('x-fastgpt-session-transport')).toBe('header');
          expect(await request.json()).toEqual({ refreshToken: auth.refreshToken });
          return Response.json({ code: 200, data: { status: 'rotated', ...next } });
        }
        received.push(request.headers.get('token')!);
        return Response.json({ code: 200, data: { ok: true } });
      }
    });
    const a = createSessionAwareClient({ client: baseClient, profileName: 'default', ...stores });
    const b = createSessionAwareClient({ client: baseClient, profileName: 'default', ...stores });
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? a : b).request({ method: 'GET', path: '/whoami', auth })
      )
    );
    expect(results.every((value) => (value as { ok: boolean }).ok)).toBe(true);
    expect(refreshes).toBe(1);
    expect(new Set(received)).toEqual(new Set([next.token]));
    const saved = decodeSessionCredential((await stores.secretStore.getSecret('default'))!);
    expect(saved).toMatchObject({
      secret: next.token,
      refreshToken: next.refreshToken,
      session: { generation: 2 }
    });
    const publicConfig = await readFile(stores.configRepo.getConfigPath(), 'utf8');
    expect(publicConfig).not.toContain(next.token);
    expect(publicConfig).not.toContain(next.refreshToken);
  });

  it('recovers a server-expired Access once and preserves the original write body', async () => {
    const stores = await makeStores();
    const auth = initial();
    auth.session.accessExpiresAt = Date.now() + 900_000;
    await stores.secretStore.setSecret('default', encodeSessionCredential(auth));
    let refreshes = 0;
    const writes: unknown[] = [];
    const base = createFastGptHttpClient({
      baseUrl: 'https://fastgpt.test/api',
      cliVersion: 'test',
      fetchFn: async (input) => {
        const request = input as Request;
        if (request.url.endsWith('/session/refresh')) {
          refreshes++;
          return Response.json({
            code: 200,
            data: {
              status: 'rotated',
              token: `at.user:device.1.2.${'c'.repeat(43)}`,
              refreshToken: `rt.user:device.1.2.${'d'.repeat(43)}`,
              session: { ...auth.session, generation: 2 }
            }
          });
        }
        writes.push(await request.json());
        return writes.length === 1
          ? Response.json({ code: 401, statusText: SessionErrEnum.accessExpired }, { status: 401 })
          : Response.json({ code: 200, data: { created: true } });
      }
    });
    const client = createSessionAwareClient({ client: base, profileName: 'default', ...stores });
    await expect(
      client.request({
        method: 'POST',
        path: '/write',
        body: { requestId: 'one-business-operation' },
        auth
      })
    ).resolves.toEqual({ created: true });
    expect(writes).toEqual([
      { requestId: 'one-business-operation' },
      { requestId: 'one-business-operation' }
    ]);
    expect(refreshes).toBe(1);
  });

  it('refuses to execute an old request after another command changed the team context', async () => {
    const stores = await makeStores();
    const old = initial();
    await stores.secretStore.setSecret(
      'default',
      encodeSessionCredential({
        ...old,
        secret: `at.user:device.2.2.${'c'.repeat(43)}`,
        session: { ...old.session, contextVersion: 2, generation: 2 }
      })
    );
    const base = createFastGptHttpClient({
      baseUrl: 'https://fastgpt.test/api',
      cliVersion: 'test',
      fetchFn: async () => {
        throw new Error('must not send');
      }
    });
    const client = createSessionAwareClient({ client: base, profileName: 'default', ...stores });
    await expect(
      client.request({ method: 'POST', path: '/write', auth: old })
    ).rejects.toMatchObject({ code: 'AUTH_CONFLICT' });
  });

  it('keeps using a still-valid Access during transient pre-refresh failure and backs off across clients', async () => {
    const stores = await makeStores();
    const auth = initial();
    await stores.secretStore.setSecret('default', encodeSessionCredential(auth));
    let refreshes = 0;
    let requests = 0;
    let rejectBusiness = false;
    const base = createFastGptHttpClient({
      baseUrl: 'https://fastgpt.test/api',
      cliVersion: 'test',
      fetchFn: async (input) => {
        if ((input as Request).url.endsWith('/session/refresh')) {
          refreshes++;
          throw new CliNetworkError('Temporary connection failure');
        }
        requests++;
        if (rejectBusiness)
          return Response.json(
            { code: 401, statusText: SessionErrEnum.accessExpired },
            { status: 401 }
          );
        return Response.json({ code: 200, data: { ok: true } });
      }
    });
    const first = createSessionAwareClient({ client: base, profileName: 'default', ...stores });
    const second = createSessionAwareClient({ client: base, profileName: 'default', ...stores });
    await expect(first.request({ method: 'GET', path: '/whoami', auth })).resolves.toEqual({
      ok: true
    });
    await expect(second.request({ method: 'GET', path: '/whoami', auth })).resolves.toEqual({
      ok: true
    });
    expect(refreshes).toBe(1);
    expect(requests).toBe(2);
    expect(
      decodeSessionCredential((await stores.secretStore.getSecret('default'))!).secret ===
        auth.secret
    ).toBe(true);
    rejectBusiness = true;
    await expect(second.request({ method: 'POST', path: '/write', auth })).rejects.toMatchObject({
      code: 'NETWORK_ERROR'
    });
    expect(refreshes).toBe(1);
  });
});
