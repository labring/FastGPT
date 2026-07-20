import { createSagaEngine, createSagaRegistry } from '@fastgpt-sdk/durable-saga';
import {
  createMongoDurableSagaStore,
  MongoDurableSagaInstance,
  MongoDurableSagaReservation
} from '@fastgpt/service/common/durableSaga';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { sandboxProvisionSagaDefinition } from '@fastgpt/service/core/ai/sandbox/application/lifecycle/definitions';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureRunning: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
  getInfo: vi.fn(async () => ({
    id: 'upstream-resource-id',
    metadata: {} as Record<string, string>,
    status: { state: 'Running' as const }
  }))
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: vi.fn(async () => undefined)
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxResourceAdapter: vi.fn(),
  buildRuntimeSandboxAdapter: () => ({
    id: 'upstream-resource-id',
    getInfo: mocks.getInfo
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle', () => ({
  ensureConnectedSandboxRunning: mocks.ensureRunning,
  disconnectSandbox: mocks.disconnect
}));

beforeAll(async () => {
  await Promise.all([
    MongoSandboxInstance.syncIndexes(),
    MongoDurableSagaInstance.syncIndexes(),
    MongoDurableSagaReservation.syncIndexes()
  ]);
});

describe('sandboxProvisionSagaDefinition', () => {
  it('creates a durable aggregate and publishes running after Provider checkpoint', async () => {
    const registry = createSagaRegistry<ClientSession>();
    registry.register(sandboxProvisionSagaDefinition);
    registry.seal();
    const engine = createSagaEngine({
      store: createMongoDurableSagaStore(),
      registry,
      heartbeatIntervalMs: 100,
      executionStaleMs: 1_000
    });
    const commandAt = new Date('2026-07-01T00:00:00.000Z');

    const result = await engine.start(sandboxProvisionSagaDefinition, {
      sagaId: 'durable-provision-saga',
      input: {
        provider: 'opensandbox',
        sandboxId: 'durable-provision-sandbox',
        sourceType: 'app',
        sourceId: 'durable-provision-app',
        userId: 'durable-provision-user',
        commandAt,
        resumeExisting: false,
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'durable-pvc',
              mountPath: '/workspace'
            }
          ],
          mountPath: '/workspace'
        },
        createConfig: { image: { repository: 'runtime/image', tag: 'v1' } }
      },
      run: true
    });

    expect(result.runResult?.type).toBe('completed');
    expect(mocks.ensureRunning).toHaveBeenCalledOnce();
    const aggregate = await MongoSandboxInstance.findOne({
      sandboxId: 'durable-provision-sandbox'
    })
      .select('-_id status metadata storage')
      .lean();
    expect(aggregate).toMatchObject({
      status: 'running',
      metadata: {
        volumeEnabled: true,
        upstreamId: 'upstream-resource-id'
      },
      storage: { mountPath: '/workspace' }
    });
    expect(aggregate).not.toHaveProperty('metadata.activeSaga');
  });

  it('rolls back the new aggregate when initialization conflicts', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'provision-existing-sandbox',
      sourceType: 'app',
      sourceId: 'provision-existing-app',
      userId: 'provision-existing-user',
      status: 'running',
      lastActiveAt: new Date(),
      createdAt: new Date(),
      metadata: {}
    });
    const registry = createSagaRegistry<ClientSession>();
    registry.register(sandboxProvisionSagaDefinition);
    registry.seal();
    const engine = createSagaEngine({
      store: createMongoDurableSagaStore(),
      registry,
      heartbeatIntervalMs: 100,
      executionStaleMs: 1_000
    });

    await expect(
      engine.start(sandboxProvisionSagaDefinition, {
        sagaId: 'provision-conflict-saga',
        input: {
          provider: 'opensandbox',
          sandboxId: 'provision-existing-sandbox',
          sourceType: 'app',
          sourceId: 'provision-existing-app',
          userId: 'provision-existing-user',
          commandAt: new Date(),
          resumeExisting: false
        }
      })
    ).rejects.toThrow('cannot claim the existing aggregate');
    expect(
      await MongoDurableSagaInstance.countDocuments({ sagaId: 'provision-conflict-saga' })
    ).toBe(0);
    expect(
      await MongoDurableSagaReservation.countDocuments({ ownerSagaId: 'provision-conflict-saga' })
    ).toBe(0);
  });
});
