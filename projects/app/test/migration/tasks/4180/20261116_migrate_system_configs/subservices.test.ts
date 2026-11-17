import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { decryptDomainSecrets } from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import {
  rehomeSubserviceConnections,
  verifyRehomedSubserviceConnections
} from '@/migration/tasks/4180/20261116_migrate_system_configs/subservices';

const assertActive = vi.fn().mockResolvedValue(undefined);
const collection = MongoSystemInstanceConfig.collection;
const run = (legacyEnv: Record<string, string | undefined> = {}) =>
  rehomeSubserviceConnections({ assertActive, legacyEnv });
const read = () => collection.findOne({ domain: 'subservice' });

beforeEach(async () => {
  assertActive.mockClear();
  await collection.insertOne({
    domain: 'subservice',
    revision: 4,
    overrides: { mcp: { sseProxyUrl: 'https://mcp.example.com' } },
    explicitDefaultPaths: []
  });
});

describe('rehomeSubserviceConnections', () => {
  it('imports valid legacy connection once and preserves later administrator values on replay', async () => {
    const env = {
      CODE_SANDBOX_URL: 'http://localhost:3002',
      CODE_SANDBOX_TOKEN: 'synthetic-token'
    };
    expect(await run(env)).toEqual({ updatedDocuments: 1 });
    const stored = (await read())?.overrides;
    expect(stored.codeSandbox.token).toEqual({ secret: expect.any(String) });
    expect(decryptDomainSecrets('subservice', stored)).toMatchObject({
      codeSandbox: { enabled: true, url: env.CODE_SANDBOX_URL, token: env.CODE_SANDBOX_TOKEN },
      mcp: { enabled: true, sseProxyUrl: 'https://mcp.example.com' }
    });
    expect(await run({ CODE_SANDBOX_URL: 'https://changed.invalid' })).toEqual({
      updatedDocuments: 0
    });
    expect((await read())?.revision).toBe(5);
    await verifyRehomedSubserviceConnections();
  });

  it('does not enable an unconfigured sandbox or recreate values after explicit clearing', async () => {
    await run();
    expect((await read())?.overrides.codeSandbox).toEqual({ enabled: false, url: '', token: '' });
    expect(await run({ CODE_SANDBOX_URL: 'http://localhost:3002' })).toEqual({
      updatedDocuments: 0
    });
    await collection.updateOne(
      { domain: 'subservice' },
      {
        $set: {
          overrides: {
            codeSandbox: { enabled: false },
            mcp: { sseProxyUrl: 'https://mcp.example.com' }
          },
          explicitDefaultPaths: ['codeSandbox.url', 'codeSandbox.token', 'mcp.enabled']
        }
      }
    );
    await run({ CODE_SANDBOX_URL: 'http://localhost:3002', CODE_SANDBOX_TOKEN: 'synthetic-token' });
    expect((await read())?.overrides).toMatchObject({
      codeSandbox: { enabled: false, url: '', token: '' },
      mcp: { enabled: false }
    });
  });

  it('preserves disabled state and uses the old token default only with an actual legacy URL', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      { $set: { overrides: { codeSandbox: { enabled: false } } } }
    );
    await run({ CODE_SANDBOX_URL: 'http://localhost:3002' });
    expect(decryptDomainSecrets('subservice', (await read())?.overrides).codeSandbox).toEqual({
      enabled: false,
      url: 'http://localhost:3002',
      token: 'codesandbox'
    });
  });

  it('preserves the old true default marker when its URL has not yet been migrated', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      { $set: { overrides: {}, explicitDefaultPaths: ['codeSandbox.enabled'] } }
    );
    await run({ CODE_SANDBOX_URL: 'http://localhost:3002', CODE_SANDBOX_TOKEN: 'old-token' });
    expect((await read())?.overrides.codeSandbox.enabled).toBe(true);
  });

  it('cleans newly retired fields even if the previous cleanup task already succeeded', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      {
        $set: { 'overrides.plugin': { remoteDebug: true }, 'overrides.aiProxy': { enabled: true } }
      }
    );
    expect(await run()).toEqual({ updatedDocuments: 1 });
    expect((await read())?.overrides).not.toHaveProperty('plugin');
    expect((await read())?.overrides).not.toHaveProperty('aiProxy');
    await verifyRehomedSubserviceConnections();
    expect(await run()).toEqual({ updatedDocuments: 0 });
  });

  it.each([
    'private-invalid-url',
    'ftp://sandbox.test',
    'https://sandbox.test?token=private-value',
    'https://sandbox.test#private-value',
    'https://user:private-value@sandbox.test'
  ])('retains an invalid legacy connection and only reports its field path: %s', async (url) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await run({ CODE_SANDBOX_URL: url, CODE_SANDBOX_TOKEN: 'private-token' });
      expect((await read())?.overrides.codeSandbox.url).toBe(url);
      expect(warn).toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
      await verifyRehomedSubserviceConnections();
    } finally {
      warn.mockRestore();
    }
  });

  it('preserves an invalid stored MCP address while filling other missing connections', async () => {
    const url = 'https://user:private-value@mcp.test';
    await collection.updateOne(
      { domain: 'subservice' },
      { $set: { 'overrides.mcp.sseProxyUrl': url } }
    );
    await run();
    expect((await read())?.overrides.mcp.sseProxyUrl).toBe(url);
    await verifyRehomedSubserviceConnections();
  });

  it('retries a concurrent admin save and does not overwrite its connection', async () => {
    assertActive.mockImplementationOnce(async () => {
      await collection.updateOne(
        { domain: 'subservice' },
        {
          $set: {
            'overrides.codeSandbox': {
              enabled: false,
              url: 'https://admin.invalid',
              token: 'admin-secret'
            }
          },
          $inc: { revision: 1 }
        }
      );
    });
    await run({ CODE_SANDBOX_URL: 'https://legacy.invalid', CODE_SANDBOX_TOKEN: 'legacy-secret' });
    expect(decryptDomainSecrets('subservice', (await read())?.overrides).codeSandbox).toEqual({
      enabled: false,
      url: 'https://admin.invalid',
      token: 'admin-secret'
    });
  });

  it('rejects malformed explicit metadata and ignores invalid legacy data when targets already exist', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      { $set: { explicitDefaultPaths: 'mcp.enabled' } }
    );
    await expect(run()).rejects.toThrow('Invalid subservice explicit-default metadata');
    await collection.updateOne(
      { domain: 'subservice' },
      {
        $set: {
          explicitDefaultPaths: [],
          overrides: {
            codeSandbox: { enabled: true, url: 'https://admin.invalid', token: 'admin-secret' },
            mcp: { enabled: false, sseProxyUrl: '' }
          }
        }
      }
    );
    expect(await run({ CODE_SANDBOX_URL: 'invalid-legacy' })).toEqual({ updatedDocuments: 0 });
  });

  it('does not claim completion from schema defaults when persistent leaves are missing', async () => {
    await expect(verifyRehomedSubserviceConnections()).rejects.toThrow('migration is incomplete');
  });

  it('stops before writing when the migration lease is lost', async () => {
    const before = await read();
    assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(run()).rejects.toThrow('lease lost');
    expect(await read()).toEqual(before);
  });
});
