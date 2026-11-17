import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { decryptDomainSecrets } from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import {
  rehomeAgentSandboxProxy,
  verifyAgentSandboxProxyMigration
} from '@/migration/tasks/4180/20261116_migrate_system_configs/subservices';

const collection = MongoSystemInstanceConfig.collection;
const assertActive = vi.fn().mockResolvedValue(undefined);
const legacyEnv = {
  AGENT_SANDBOX_PROXY_URL: 'wss://proxy.test/base',
  AGENT_SANDBOX_PREVIEW_PROXY_URL: 'https://preview.test/base',
  AGENT_SANDBOX_PROXY_SECRET: 'proxy_secret_32_characters_minimum'
};
const run = (env: Record<string, string | undefined> = legacyEnv) =>
  rehomeAgentSandboxProxy({ assertActive, legacyEnv: env });
const read = () => collection.findOne({ domain: 'subservice' });

beforeEach(async () => {
  assertActive.mockReset().mockResolvedValue(undefined);
  await collection.insertOne({
    domain: 'subservice',
    revision: 4,
    overrides: { mcp: { enabled: false } },
    explicitDefaultPaths: []
  });
});

describe('rehomeAgentSandboxProxy', () => {
  it('imports all three fields atomically and ignores changed ENV on replay', async () => {
    expect(await run()).toEqual({ updatedDocuments: 1 });
    const stored = (await read())?.overrides;
    expect(stored.agentSandbox.proxy.secret).toEqual({ secret: expect.any(String) });
    expect(decryptDomainSecrets('subservice', stored).agentSandbox.proxy).toEqual({
      wsUrl: legacyEnv.AGENT_SANDBOX_PROXY_URL,
      previewUrl: legacyEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL,
      secret: legacyEnv.AGENT_SANDBOX_PROXY_SECRET
    });
    expect(await run({ AGENT_SANDBOX_PROXY_SECRET: 'invalid' })).toEqual({ updatedDocuments: 0 });
    expect((await read())?.revision).toBe(5);
    await verifyAgentSandboxProxyMigration();
  });

  it('imports proxy config for an enabled sandbox provider whose stored subservice lacks proxy fields', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      {
        $set: {
          overrides: {
            agentSandbox: {
              provider: 'sealosdevbox',
              sealosdevbox: { baseUrl: 'https://devbox.example.test' }
            }
          }
        }
      }
    );

    expect(await run()).toEqual({ updatedDocuments: 1 });
    expect(decryptDomainSecrets('subservice', (await read())?.overrides).agentSandbox).toEqual({
      provider: 'sealosdevbox',
      sealosdevbox: { baseUrl: 'https://devbox.example.test' },
      proxy: {
        wsUrl: legacyEnv.AGENT_SANDBOX_PROXY_URL,
        previewUrl: legacyEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL,
        secret: legacyEnv.AGENT_SANDBOX_PROXY_SECRET
      }
    });
    await verifyAgentSandboxProxyMigration();
  });

  it('completes enabled sandbox proxy migration with warnings when legacy fields are missing', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      {
        $set: {
          overrides: {
            agentSandbox: {
              provider: 'sealosdevbox',
              sealosdevbox: { baseUrl: 'https://devbox.example.test' }
            }
          }
        }
      }
    );

    await expect(run({})).resolves.toEqual({ updatedDocuments: 1 });
    await expect(verifyAgentSandboxProxyMigration()).resolves.toBeUndefined();
    expect((await read())?.overrides.agentSandbox.proxy.wsUrl).toBe('');
  });

  it('preserves administrator values and explicit clears, including absent ENV', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      {
        $set: {
          'overrides.agentSandbox.proxy': { wsUrl: 'ws://admin.test', secret: '' },
          explicitDefaultPaths: ['agentSandbox.proxy.previewUrl']
        }
      }
    );
    await run();
    expect((await read())?.overrides.agentSandbox.proxy).toEqual({
      wsUrl: 'ws://admin.test',
      previewUrl: '',
      secret: ''
    });
    await verifyAgentSandboxProxyMigration();
    await collection.updateOne(
      { domain: 'subservice' },
      { $set: { overrides: {}, explicitDefaultPaths: [] } }
    );
    await run({});
    expect((await read())?.overrides.agentSandbox.proxy).toEqual({
      wsUrl: '',
      previewUrl: '',
      secret: ''
    });
    expect(await run()).toEqual({ updatedDocuments: 0 });
  });

  it.each([
    { AGENT_SANDBOX_PROXY_URL: 'https://wrong-protocol.test' },
    { AGENT_SANDBOX_PREVIEW_PROXY_URL: 'ws://wrong-protocol.test' },
    { AGENT_SANDBOX_PROXY_URL: 'wss://%invalid' },
    { AGENT_SANDBOX_PROXY_SECRET: 'private-short' }
  ])('retains malformed source fields with path-only warnings: %j', async (invalid) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(run({ ...legacyEnv, ...invalid })).resolves.toEqual({ updatedDocuments: 1 });
      await expect(verifyAgentSandboxProxyMigration()).resolves.toBeUndefined();
      const proxy = decryptDomainSecrets('subservice', (await read())?.overrides).agentSandbox
        .proxy;
      if (invalid.AGENT_SANDBOX_PROXY_URL !== undefined)
        expect(proxy.wsUrl).toBe(invalid.AGENT_SANDBOX_PROXY_URL);
      if (invalid.AGENT_SANDBOX_PREVIEW_PROXY_URL !== undefined)
        expect(proxy.previewUrl).toBe(invalid.AGENT_SANDBOX_PREVIEW_PROXY_URL);
      if (invalid.AGENT_SANDBOX_PROXY_SECRET !== undefined)
        expect(proxy.secret).toBe(invalid.AGENT_SANDBOX_PROXY_SECRET);
      expect(warn).toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain('private-short');
    } finally {
      warn.mockRestore();
    }
  });

  it.each([null, 'invalid', { secret: null }])(
    'does not normalize malformed stored proxy data: %j',
    async (proxy) => {
      await collection.updateOne(
        { domain: 'subservice' },
        { $set: { 'overrides.agentSandbox.proxy': proxy } }
      );
      await run();
      const retained = decryptDomainSecrets('subservice', (await read())?.overrides).agentSandbox
        .proxy;
      if (proxy && typeof proxy === 'object') expect(retained).toMatchObject(proxy);
      else expect(retained).toEqual(proxy);
    }
  );

  it('retries CAS conflicts and preserves a concurrent administrator save', async () => {
    assertActive.mockImplementationOnce(async () => {
      await collection.updateOne(
        { domain: 'subservice' },
        {
          $set: { 'overrides.agentSandbox.proxy': { wsUrl: 'wss://admin.test' } },
          $inc: { revision: 1 }
        }
      );
    });
    await run();
    expect((await read())?.overrides.agentSandbox.proxy.wsUrl).toBe('wss://admin.test');
    expect((await read())?.revision).toBe(6);
  });

  it('fails bounded retries without claiming completion', async () => {
    assertActive.mockImplementation(async () => {
      await collection.updateOne({ domain: 'subservice' }, { $inc: { revision: 1 } });
    });
    await expect(run()).rejects.toThrow('repeatedly conflicted');
    expect(assertActive).toHaveBeenCalledTimes(5);
    expect((await read())?.overrides).not.toHaveProperty('agentSandbox');
  });

  it('stops before writing when its lease is lost', async () => {
    const before = await read();
    assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(run()).rejects.toThrow('lease lost');
    expect(await read()).toEqual(before);
  });

  it('rejects malformed metadata', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      { $set: { explicitDefaultPaths: 'invalid' } }
    );
    await expect(run()).rejects.toThrow('Invalid subservice explicit-default metadata');
  });

  it('requires a persisted domain', async () => {
    await collection.deleteMany({});
    await expect(run()).rejects.toThrow('Subservice instance config is missing');
    await expect(verifyAgentSandboxProxyMigration()).rejects.toThrow(
      'Subservice instance config is missing'
    );
  });
});

describe('verifyAgentSandboxProxyMigration', () => {
  it('does not claim completion from schema defaults or accept invalid persisted data', async () => {
    await expect(verifyAgentSandboxProxyMigration()).rejects.toThrow('migration is incomplete');
    await collection.updateOne(
      { domain: 'subservice' },
      { $set: { 'overrides.agentSandbox.proxy': { secret: 'short' } } }
    );
    await expect(verifyAgentSandboxProxyMigration()).rejects.toThrow('migration is incomplete');
    await run();
    await expect(verifyAgentSandboxProxyMigration()).resolves.toBeUndefined();
  });
});
