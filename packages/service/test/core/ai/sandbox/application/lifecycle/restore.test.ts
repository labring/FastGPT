import { createSagaEngine, createSagaRegistry } from '@fastgpt-sdk/durable-saga';
import {
  createMongoDurableSagaStore,
  MongoDurableSagaInstance,
  MongoDurableSagaReservation
} from '@fastgpt/service/common/durableSaga';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { sandboxRestoreSagaDefinition } from '@fastgpt/service/core/ai/sandbox/application/lifecycle/definitions';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  install: vi.fn(async () => ({
    upstreamId: 'restored-upstream-id',
    storage: {
      volumes: [{ name: 'workspace', claimName: 'restore-pvc', mountPath: '/workspace' }],
      mountPath: '/workspace'
    }
  })),
  inspect: vi.fn(async () => ({ applied: false as const })),
  archiveDelete: vi.fn(async () => undefined)
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: vi.fn(async () => undefined)
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({ deleteWorkspaceArchive: mocks.archiveDelete })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => ({
  deleteArchivedRemoteResource: vi.fn(),
  uploadSandboxWorkspaceArchive: vi.fn(),
  installSandboxWorkspaceArchive: mocks.install,
  inspectSandboxWorkspaceRestore: mocks.inspect
}));

beforeAll(async () => {
  await Promise.all([
    MongoSandboxInstance.syncIndexes(),
    MongoDurableSagaInstance.syncIndexes(),
    MongoDurableSagaReservation.syncIndexes()
  ]);
});

describe('sandboxRestoreSagaDefinition', () => {
  it('publishes running only after the archive marker is checkpointed', async () => {
    const lastActiveAt = new Date('2026-05-01T00:00:00.000Z');
    const resource = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'durable-restore-sandbox',
      sourceType: 'app',
      sourceId: 'durable-restore-app',
      userId: 'durable-restore-user',
      status: 'archived',
      lastActiveAt,
      createdAt: lastActiveAt,
      metadata: {}
    });
    const registry = createSagaRegistry<ClientSession>();
    registry.register(sandboxRestoreSagaDefinition);
    registry.seal();
    const engine = createSagaEngine({
      store: createMongoDurableSagaStore(),
      registry,
      heartbeatIntervalMs: 100,
      executionStaleMs: 1_000
    });

    const result = await engine.start(sandboxRestoreSagaDefinition, {
      sagaId: 'durable-restore-saga',
      input: {
        resourceId: resource._id.toString(),
        provider: 'opensandbox',
        sandboxId: 'durable-restore-sandbox',
        sourceType: 'app',
        sourceId: 'durable-restore-app',
        userId: 'durable-restore-user',
        lastActiveAt,
        storage: {
          volumes: [{ name: 'workspace', claimName: 'restore-pvc', mountPath: '/workspace' }],
          mountPath: '/workspace'
        },
        createConfig: { image: { repository: 'runtime/image', tag: 'v1' } }
      },
      run: true
    });

    expect(result.runResult?.type).toBe('completed');
    expect(mocks.install).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'durable-restore-sandbox',
        idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
    const restored = await MongoSandboxInstance.findById(resource._id)
      .select('-_id status storage metadata lastActiveAt')
      .lean();
    expect(restored).toMatchObject({
      status: 'running',
      storage: { mountPath: '/workspace' },
      metadata: {
        volumeEnabled: true,
        upstreamId: 'restored-upstream-id'
      }
    });
    expect(restored).not.toHaveProperty('metadata.activeSaga');
    expect(restored!.lastActiveAt.getTime()).toBeGreaterThan(lastActiveAt.getTime());
    expect(mocks.archiveDelete).toHaveBeenCalledWith({
      sandboxId: 'durable-restore-sandbox'
    });
  });
});
