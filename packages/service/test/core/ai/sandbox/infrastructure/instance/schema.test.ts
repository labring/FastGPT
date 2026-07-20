import { describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';

const baseInstance = {
  provider: 'opensandbox',
  sandboxId: 'schema-test-sandbox',
  sourceType: 'app',
  sourceId: 'schema-test-app',
  userId: 'schema-test-user',
  lastActiveAt: new Date(),
  createdAt: new Date()
};

describe('MongoSandboxInstance schema', () => {
  it('declares identity, lifecycle and inactive-query indexes', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    const providerIndex = indexes.find(
      ([keys, options]) => keys.provider === 1 && keys.sandboxId === 1 && options?.unique === true
    );
    const logicalIndex = indexes.find(
      ([keys, options]) =>
        keys.sourceType === 1 &&
        keys.sourceId === 1 &&
        keys.userId === 1 &&
        options?.unique === true
    );

    expect(providerIndex?.[0]).toEqual({ provider: 1, sandboxId: 1 });
    expect(logicalIndex?.[0]).toEqual({ sourceType: 1, sourceId: 1, userId: 1 });
    expect(indexes.some(([keys]) => keys.status === 1 && keys.lastActiveAt === 1)).toBe(true);
    expect(
      indexes.some(([keys]) => keys.status === 1 && keys['metadata.activeSaga.sagaId'] === 1)
    ).toBe(true);
  });

  it('accepts every stable state without activeSaga', async () => {
    for (const status of ['running', 'stopped', 'archived']) {
      await expect(
        new MongoSandboxInstance({ ...baseInstance, status }).validate()
      ).resolves.toBeUndefined();
    }
  });

  it('accepts only a non-empty upstream handle', async () => {
    const instance = new MongoSandboxInstance({
      ...baseInstance,
      status: 'running',
      metadata: { upstreamId: 'opensandbox-resource-1' }
    });
    await expect(instance.validate()).resolves.toBeUndefined();
    expect(instance.metadata?.upstreamId).toBe('opensandbox-resource-1');

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        metadata: { upstreamId: '' }
      }).validate()
    ).rejects.toThrow();
  });

  it('accepts every transitional state with its matching activeSaga', async () => {
    const transitions = [
      ['provisioning', 'provision'],
      ['legacyMigrating', 'legacyMigration'],
      ['stopping', 'stop'],
      ['archiving', 'archive'],
      ['restoring', 'restore'],
      ['providerMigrating', 'providerMigration'],
      ['deleting', 'delete']
    ] as const;

    for (const [status, type] of transitions) {
      await expect(
        new MongoSandboxInstance({
          ...baseInstance,
          status,
          metadata: { activeSaga: { sagaId: `${type}-saga`, type } }
        }).validate()
      ).resolves.toBeUndefined();
    }
  });

  it('rejects transitional states with a missing or mismatched activeSaga', async () => {
    await expect(
      new MongoSandboxInstance({ ...baseInstance, status: 'archiving' }).validate()
    ).rejects.toThrow('Status archiving requires archive activeSaga');

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'archiving',
        metadata: { activeSaga: { sagaId: 'wrong-saga', type: 'stop' } }
      }).validate()
    ).rejects.toThrow('Status archiving requires archive activeSaga');
  });

  it('rejects stable states that retain an activeSaga', async () => {
    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        metadata: { activeSaga: { sagaId: 'stale-saga', type: 'stop' } }
      }).validate()
    ).rejects.toThrow('Stable status running must not keep an activeSaga');
  });

  it('rejects invalid activeSaga metadata', async () => {
    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'stopping',
        metadata: { activeSaga: { type: 'stop' } }
      }).validate()
    ).rejects.toThrow();
    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'stopping',
        metadata: { activeSaga: { sagaId: 'stop-saga', type: 'unknown' } }
      }).validate()
    ).rejects.toThrow();
  });

  it('rejects unsupported metadata fields', async () => {
    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        metadata: { unexpected: true }
      }).validate()
    ).rejects.toThrow();
  });
});
