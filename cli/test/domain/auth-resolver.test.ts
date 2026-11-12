import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertAuthAllowed, resolveEffectiveAuth } from '../../src/domain/auth/auth-resolver';
import { createFileConfigRepository } from '../../src/infra/config/config-repository';
import { createDefaultSecretStore } from '../../src/infra/secrets/secret-store';
import { CliArgumentError, CliAuthError } from '../../src/shared/errors';

const tempDirs: string[] = [];

async function makeStores() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-auth-'));
  tempDirs.push(dir);
  const env = { FASTGPT_SECRET_STORE: 'file' };
  const configRepo = createFileConfigRepository({ configDir: dir });
  const secretStore = createDefaultSecretStore({ configDir: dir, env });
  return { dir, env, configRepo, secretStore };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('auth-resolver', () => {
  it('applies flag > env > profile precedence and rejects conflicting env vars or flags', async () => {
    const { configRepo, secretStore } = await makeStores();
    await secretStore.setSecret('default', 'profile-tok');
    await configRepo.write({
      schemaVersion: 1,
      currentProfile: 'default',
      profiles: {
        default: {
          baseUrl: 'https://profile.example.com/api',
          authType: 'token',
          sessionExpiresAt: Date.now() + 60_000,
          updatedAt: 1000
        }
      }
    });

    const fromProfile = await resolveEffectiveAuth({
      options: { allowInsecureHttp: false },
      env: {},
      configRepo,
      secretStore
    });
    expect(fromProfile.credential).toMatchObject({
      source: 'profile',
      authType: 'token',
      secret: 'profile-tok'
    });
    expect(fromProfile.baseUrl).toBe('https://profile.example.com/api');

    const fromEnv = await resolveEffectiveAuth({
      options: { allowInsecureHttp: false },
      env: {
        FASTGPT_BASE_URL: 'https://env.example.com',
        FASTGPT_API_KEY: 'env-key'
      },
      configRepo,
      secretStore
    });
    expect(fromEnv.credential).toMatchObject({
      source: 'env',
      authType: 'apikey',
      secret: 'env-key'
    });
    expect(fromEnv.baseUrl).toBe('https://env.example.com/api');

    const fromFlag = await resolveEffectiveAuth({
      options: { token: 'flag-tok', allowInsecureHttp: false },
      env: { FASTGPT_TOKEN: 'env-tok', FASTGPT_API_KEY: 'env-key' },
      configRepo,
      secretStore
    });
    expect(fromFlag.credential).toMatchObject({
      source: 'flag',
      authType: 'token',
      secret: 'flag-tok'
    });

    await expect(
      resolveEffectiveAuth({
        options: { allowInsecureHttp: false },
        env: { FASTGPT_TOKEN: 'env-tok', FASTGPT_API_KEY: 'env-key' },
        configRepo,
        secretStore
      })
    ).rejects.toThrow(CliAuthError);

    await expect(
      resolveEffectiveAuth({
        options: { token: 't', apiKey: 'k', allowInsecureHttp: false },
        env: {},
        configRepo,
        secretStore
      })
    ).rejects.toThrow(CliArgumentError);
  });

  it('enforces local pre-flight authModes and session expiration checks', async () => {
    const { configRepo, secretStore } = await makeStores();
    await secretStore.setSecret('app-prof', 'fastgpt-app-key');
    await secretStore.setSecret('expired-prof', 'user:expired-tok');

    await configRepo.write({
      schemaVersion: 1,
      currentProfile: 'app-prof',
      profiles: {
        'app-prof': {
          baseUrl: 'https://cloud.fastgpt.in/api',
          authType: 'apikey',
          apiKeyType: 'app',
          boundAppId: '68ad85a7463006c963799a05',
          updatedAt: 1000
        },
        'expired-prof': {
          baseUrl: 'https://cloud.fastgpt.in/api',
          authType: 'token',
          sessionExpiresAt: 5000,
          updatedAt: 1000
        }
      }
    });

    const appResolved = await resolveEffectiveAuth({
      options: { allowInsecureHttp: false },
      env: {},
      configRepo,
      secretStore
    });
    expect(() =>
      assertAuthAllowed({
        resolved: appResolved,
        authModes: ['token', 'personalKey'],
        commandName: 'dataset search'
      })
    ).toThrow(CliAuthError);

    expect(() =>
      assertAuthAllowed({
        resolved: appResolved,
        authModes: ['token', 'personalKey', 'appKey'],
        commandName: 'whoami'
      })
    ).not.toThrow();

    const expiredResolved = await resolveEffectiveAuth({
      options: { profile: 'expired-prof', allowInsecureHttp: false },
      env: {},
      configRepo,
      secretStore
    });
    expect(() =>
      assertAuthAllowed({
        resolved: expiredResolved,
        authModes: ['token'],
        commandName: 'auth switch-team',
        now: 6000
      })
    ).toThrow(/expired/i);

    expect(() =>
      assertAuthAllowed({
        resolved: {
          profileName: 'empty',
          baseUrl: 'https://cloud.fastgpt.in/api',
          allowInsecureHttp: false,
          warnings: []
        },
        authModes: ['none'],
        commandName: 'doctor'
      })
    ).not.toThrow();
  });
});
