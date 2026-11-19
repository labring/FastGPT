import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  rehomeSandboxOvercommit,
  verifySandboxOvercommitMigration
} from '@/migration/tasks/4180/20261116_migrate_system_configs/subservices';

const collection = MongoSystemInstanceConfig.collection;
const assertActive = vi.fn().mockResolvedValue(undefined);
const run = (legacyEnv: Record<string, string | undefined> = {}) =>
  rehomeSandboxOvercommit({ assertActive, legacyEnv });
const read = () => collection.findOne({ domain: 'subservice' });

beforeEach(async () => {
  assertActive.mockReset().mockResolvedValue(undefined);
  await collection.insertOne({
    domain: 'subservice',
    revision: 4,
    overrides: {
      mcp: { enabled: false },
      agentSandbox: { opensandbox: { image: 'runtime:test' } }
    },
    explicitDefaultPaths: []
  });
});

describe('rehomeSandboxOvercommit', () => {
  it('imports independent fractional ENV values and preserves unrelated configuration', async () => {
    expect(
      await run({
        AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: '2.5',
        AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR: '4'
      })
    ).toEqual({ updatedDocuments: 1 });
    expect((await read())?.overrides).toMatchObject({
      mcp: { enabled: false },
      agentSandbox: {
        opensandbox: { image: 'runtime:test', cpuOvercommitFactor: 2.5, memoryOvercommitFactor: 4 }
      }
    });
    await verifySandboxOvercommitMigration();
  });

  it('persists defaults and ignores changed ENV on replay', async () => {
    expect(await run()).toEqual({ updatedDocuments: 1 });
    expect(await run({ AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: 'invalid' })).toEqual({
      updatedDocuments: 0
    });
    expect(await read()).toMatchObject({
      revision: 5,
      overrides: {
        agentSandbox: { opensandbox: { cpuOvercommitFactor: 1, memoryOvercommitFactor: 1 } }
      }
    });
    await verifySandboxOvercommitMigration();
  });

  it('preserves stored values and explicit defaults without parsing obsolete invalid ENV', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      {
        $set: {
          'overrides.agentSandbox.opensandbox.cpuOvercommitFactor': 7,
          explicitDefaultPaths: ['agentSandbox.opensandbox.memoryOvercommitFactor']
        }
      }
    );
    expect(
      await run({
        AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: 'invalid',
        AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR: '9'
      })
    ).toEqual({ updatedDocuments: 0 });
    expect((await read())?.overrides.agentSandbox.opensandbox.cpuOvercommitFactor).toBe(7);
    await verifySandboxOvercommitMigration();
  });

  it('retries a real revision conflict and preserves the administrator value', async () => {
    assertActive.mockImplementationOnce(async () => {
      await collection.updateOne(
        { domain: 'subservice' },
        {
          $set: { 'overrides.agentSandbox.opensandbox.cpuOvercommitFactor': 7 },
          $inc: { revision: 1 }
        }
      );
    });
    expect(
      await run({
        AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: '2',
        AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR: '3'
      })
    ).toEqual({ updatedDocuments: 1 });
    expect(await read()).toMatchObject({
      revision: 6,
      overrides: {
        agentSandbox: { opensandbox: { cpuOvercommitFactor: 7, memoryOvercommitFactor: 3 } }
      }
    });
  });

  it.each([
    { AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: '0' },
    { AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: '0.5' },
    { AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: 'Infinity' },
    { AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: 'sensitive-invalid-value' },
    { AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: '2', AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR: 'invalid' }
  ])('retains invalid legacy input while completing the migration: %j', async (env) => {
    await expect(run(env)).resolves.toEqual({ updatedDocuments: 1 });
    const stored = (await read())?.overrides.agentSandbox.opensandbox;
    expect(stored.image).toBe('runtime:test');
    expect(stored.cpuOvercommitFactor).toBe(
      env.AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR === '2' ? 2 : env.AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR
    );
    await verifySandboxOvercommitMigration();
  });

  it('stops before writing when the lease is lost', async () => {
    assertActive.mockRejectedValue(new Error('lease lost'));
    await expect(run()).rejects.toThrow('lease lost');
    expect((await read())?.revision).toBe(4);
  });

  it('stops after bounded retries without overwriting continuously changing configuration', async () => {
    assertActive.mockImplementation(async () => {
      await collection.updateOne({ domain: 'subservice' }, { $inc: { revision: 1 } });
    });
    await expect(run()).rejects.toThrow('repeatedly conflicted');
    expect(assertActive).toHaveBeenCalledTimes(5);
    expect((await read())?.overrides.agentSandbox.opensandbox).toEqual({ image: 'runtime:test' });
  });

  it('rejects invalid explicit-default metadata and missing source documents', async () => {
    await collection.updateOne(
      { domain: 'subservice' },
      { $set: { 'overrides.agentSandbox.opensandbox.cpuOvercommitFactor': 0.5 } }
    );
    await run();
    expect((await read())?.overrides.agentSandbox.opensandbox.cpuOvercommitFactor).toBe(0.5);
    await collection.updateOne({ domain: 'subservice' }, { $set: { explicitDefaultPaths: [3] } });
    await expect(run()).rejects.toThrow('explicit-default');
    await collection.deleteMany({});
    await expect(run()).rejects.toThrow('Subservice instance config is missing');
  });
});

describe('verifySandboxOvercommitMigration', () => {
  it('rejects unresolved defaults instead of treating Schema defaults as completion', async () => {
    await expect(verifySandboxOvercommitMigration()).rejects.toThrow('incomplete');
    await run();
    await verifySandboxOvercommitMigration();
  });
});
