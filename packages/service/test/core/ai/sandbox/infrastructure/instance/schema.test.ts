import { describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { getSchemaDeprecatedMongoIndexes } from '@fastgpt/service/common/mongo';

const baseInstance = {
  sandboxId: 'schema-test-sandbox',
  sourceType: 'app' as const,
  sourceId: 'schema-test-app',
  userId: 'schema-test-user',
  teamId: 'schema-test-team',
  lastActiveAt: new Date(),
  createdAt: new Date()
};

describe('MongoSandboxInstance v3 schema and indexes', () => {
  it('declares all 6 current v3 indexes and zero deprecated indexes', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    expect(indexes).toHaveLength(6);

    expect(indexes).toEqual([
      [{ sandboxId: 1 }, { background: true, unique: true }],
      [
        { sourceType: 1, sourceId: 1, userId: 1 },
        { background: true, unique: true }
      ],
      [{ teamId: 1, status: 1 }, { background: true }],
      [{ status: 1, lastActiveAt: 1 }, { background: true }],
      [{ status: 1, 'operation.heartbeatAt': 1 }, { background: true }],
      [{ 'storage.volumes.claimName': 1 }, { background: true }]
    ]);

    expect(getSchemaDeprecatedMongoIndexes(MongoSandboxInstance.schema)).toEqual([]);
  });

  it('requires teamId and enforces instanceId invariants on running and stopped states', async () => {
    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        teamId: undefined,
        status: 'stopped'
      }).validate()
    ).rejects.toThrow(/teamId/);

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        instanceId: 'remote-container-1'
      }).validate()
    ).resolves.toBeUndefined();

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running'
      }).validate()
    ).rejects.toThrow('Running status requires a non-empty instanceId');

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        instanceId: '   '
      }).validate()
    ).rejects.toThrow('Running status requires a non-empty instanceId');

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'stopped'
      }).validate()
    ).resolves.toBeUndefined();

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'stopped',
        instanceId: 'stale-container-1'
      }).validate()
    ).rejects.toThrow('Stopped status must not keep an instanceId');
  });

  it('validates structured resourceLimits, storage volumes, and context subdocuments strictly', async () => {
    const doc = new MongoSandboxInstance({
      ...baseInstance,
      status: 'stopped',
      resourceLimits: {
        cpuCount: 2,
        memoryMiB: 2048,
        ephemeralStorageSize: '20Gi'
      },
      storage: {
        volumes: [
          {
            name: 'workspace',
            claimName: 'fastgpt-session-schema-test-12345678',
            mountPath: '/workspace'
          }
        ]
      },
      context: {
        skillVersionId: '507f1f77bcf86cd799439012'
      }
    });
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.toObject().storage?.volumes?.[0]?.readOnly).toBe(false);

    // Volumeless instance does not auto-populate volumes: []
    const volumeless = new MongoSandboxInstance({
      ...baseInstance,
      status: 'stopped'
    });
    await expect(volumeless.validate()).resolves.toBeUndefined();
    expect(volumeless.toObject().storage).toBeUndefined();

    // Outer redundant storage.mountPath is rejected by strict sub-schema
    await expect(
      (async () => {
        const invalidStorage = new MongoSandboxInstance({
          ...baseInstance,
          status: 'stopped',
          storage: {
            volumes: [
              {
                name: 'workspace',
                claimName: 'fastgpt-session-schema-test-12345678',
                mountPath: '/workspace'
              }
            ],
            mountPath: '/workspace'
          }
        } as unknown as Record<string, unknown>);
        await invalidStorage.validate();
      })()
    ).rejects.toThrow(/mountPath/);

    // Legacy top-level limit / versionId are rejected by strict root schema
    await expect(
      (async () => {
        const invalidRoot = new MongoSandboxInstance({
          ...baseInstance,
          status: 'stopped',
          versionId: 'legacy-version'
        } as unknown as Record<string, unknown>);
        await invalidRoot.validate();
      })()
    ).rejects.toThrow(/versionId/);
  });

  it('accepts matching transition operations and rejects missing, mismatched and stale operations', async () => {
    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'stopping',
        instanceId: 'remote-container-1',
        operation: {
          id: 'stop-operation',
          type: 'stop',
          phase: 'claimed',
          startedAt: new Date(),
          heartbeatAt: new Date()
        }
      }).validate()
    ).resolves.toBeUndefined();

    await expect(
      new MongoSandboxInstance({ ...baseInstance, status: 'provisioning' }).validate()
    ).rejects.toThrow('Status provisioning requires provision operation');

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'provisioning',
        operation: {
          id: 'wrong-operation',
          type: 'stop',
          phase: 'claimed',
          startedAt: new Date(),
          heartbeatAt: new Date()
        }
      }).validate()
    ).rejects.toThrow('Status provisioning requires provision operation');

    await expect(
      new MongoSandboxInstance({
        ...baseInstance,
        status: 'running',
        instanceId: 'remote-container-1',
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

  it('rejects removed archive and legacy migration states', async () => {
    await expect(
      new MongoSandboxInstance({ ...baseInstance, status: 'archived' }).validate()
    ).rejects.toThrow();

    await expect(
      new MongoSandboxInstance({ ...baseInstance, status: 'legacyMigrating' }).validate()
    ).rejects.toThrow();
  });
});
