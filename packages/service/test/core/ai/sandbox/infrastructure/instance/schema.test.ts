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

describe('MongoSandboxInstance schema indexes', () => {
  it('declares physical and logical sandbox uniqueness', () => {
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
      indexes.some(([keys]) => keys.status === 1 && keys['metadata.operation.heartbeatAt'] === 1)
    ).toBe(true);
  });

  it('accepts stable states without operation and matching transition operations', async () => {
    await expect(
      new MongoSandboxInstance({ ...baseInstance, status: 'running' }).validate()
    ).resolves.toBeUndefined();

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'archiving',
        metadata: {
          operation: {
            id: 'archive-operation',
            type: 'archive',
            phase: 'claimed',
            startedAt: new Date(),
            heartbeatAt: new Date()
          }
        }
      }).validate()
    ).resolves.toBeUndefined();
  });

  it('rejects missing, mismatched and stale operations', async () => {
    await expect(
      new MongoSandboxInstance({ ...baseInstance, status: 'archiving' }).validate()
    ).rejects.toThrow('Status archiving requires archive operation');

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'archiving',
        metadata: {
          operation: {
            id: 'wrong-operation',
            type: 'stop',
            phase: 'claimed',
            startedAt: new Date(),
            heartbeatAt: new Date()
          }
        }
      }).validate()
    ).rejects.toThrow('Status archiving requires archive operation');

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        metadata: {
          operation: {
            id: 'stale-operation',
            type: 'stop',
            phase: 'claimed',
            startedAt: new Date(),
            heartbeatAt: new Date()
          }
        }
      }).validate()
    ).rejects.toThrow('Stable status running must not keep an operation');
  });

  it('rejects the removed provider migration state and operation', async () => {
    await expect(
      new MongoSandboxInstance({ ...baseInstance, status: 'providerMigrating' }).validate()
    ).rejects.toThrow();

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'archiving',
        metadata: {
          operation: {
            id: 'provider-migration-operation',
            type: 'providerMigration',
            phase: 'claimed',
            startedAt: new Date(),
            heartbeatAt: new Date()
          }
        }
      }).validate()
    ).rejects.toThrow();
  });

  it('rejects legacy archive and migration metadata in the v2 model', async () => {
    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        metadata: { archive: { state: 'archived' } }
      }).validate()
    ).rejects.toThrow();

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        metadata: { migration: 'migrating' }
      }).validate()
    ).rejects.toThrow();
  });
});
