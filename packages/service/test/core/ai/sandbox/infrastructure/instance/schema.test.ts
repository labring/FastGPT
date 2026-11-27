import { describe, expect, it } from 'vitest';
import {
  collectionName,
  getLegacySandboxInstanceCollection,
  LEGACY_SANDBOX_INSTANCE_COLLECTION_NAME,
  MongoSandboxInstance
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { getSchemaDeprecatedMongoIndexes } from '@fastgpt/service/common/mongo';
import { LEGACY_DEPRECATED_MONGO_INDEXES } from '@fastgpt/service/common/mongo/legacyDeprecatedIndexCleanup';

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
    expect(indexes.some(([keys]) => keys.status === 1 && keys['operation.heartbeatAt'] === 1)).toBe(
      true
    );
    const claimNameIndex = indexes.find(([keys]) => keys['storage.volumes.claimName'] === 1);
    expect(claimNameIndex?.[1]?.name).toBe('fg_sandbox_inst_claim_name');
  });

  it('binds runtime model to v3, keeps v2 handle separate, and tracks retired v2 indexes in explicit cleanup registry', () => {
    expect(collectionName).toBe('agent_sandbox_instances_v3');
    expect(MongoSandboxInstance.collection.collectionName).toBe('agent_sandbox_instances_v3');
    expect(LEGACY_SANDBOX_INSTANCE_COLLECTION_NAME).toBe('agent_sandbox_instances_v2');
    expect(getLegacySandboxInstanceCollection().collectionName).toBe('agent_sandbox_instances_v2');
    // 零墓碑原则：Schema 内不再保留 deprecated: true，历史废弃索引统一由显式清理清单托管。
    expect(getSchemaDeprecatedMongoIndexes(MongoSandboxInstance.schema)).toEqual([]);
    const legacySandboxIndexes = LEGACY_DEPRECATED_MONGO_INDEXES.filter(
      (entry) => entry.collectionName === 'agent_sandbox_instances_v2'
    );
    expect(legacySandboxIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          datasource: 'main',
          indexName: 'sourceType_1_status_1_provider_1',
          key: { sourceType: 1, status: 1, provider: 1 },
          options: {}
        }),
        expect.objectContaining({
          datasource: 'main',
          indexName: 'status_1_metadata.operation.heartbeatAt_1',
          key: { status: 1, 'metadata.operation.heartbeatAt': 1 },
          options: {}
        })
      ])
    );
  });

  it('accepts stable states without operation and matching transition operations', async () => {
    await expect(
      new MongoSandboxInstance({ ...baseInstance, status: 'running' }).validate()
    ).resolves.toBeUndefined();

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'archiving',
        operation: {
          id: 'archive-operation',
          type: 'archive',
          phase: 'claimed',
          startedAt: new Date(),
          heartbeatAt: new Date()
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
        operation: {
          id: 'wrong-operation',
          type: 'stop',
          phase: 'claimed',
          startedAt: new Date(),
          heartbeatAt: new Date()
        }
      }).validate()
    ).rejects.toThrow('Status archiving requires archive operation');

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        operation: {
          id: 'stale-operation',
          type: 'stop',
          phase: 'claimed',
          startedAt: new Date(),
          heartbeatAt: new Date()
        }
      }).validate()
    ).rejects.toThrow('Stable status running must not keep an operation');
  });

  it('persists runtime resource limits via SandboxLimitMongoSchema rather than raw Zod shape', async () => {
    const doc = new MongoSandboxInstance({
      ...baseInstance,
      status: 'running',
      limit: {
        cpuCount: 2,
        memoryMiB: 2048
      }
    });
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.limit?.toObject?.() ?? doc.limit).toEqual({
      cpuCount: 2,
      memoryMiB: 2048
    });
  });
});
