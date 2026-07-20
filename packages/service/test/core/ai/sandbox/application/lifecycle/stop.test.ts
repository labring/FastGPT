import { createSagaEngine, createSagaRegistry } from '@fastgpt-sdk/durable-saga';
import {
  createMongoDurableSagaStore,
  MongoDurableSagaInstance,
  MongoDurableSagaReservation
} from '@fastgpt/service/common/durableSaga';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { sandboxStopSagaDefinition } from '@fastgpt/service/core/ai/sandbox/application/lifecycle/definitions';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const stop = vi.fn(async () => undefined);
  return {
    stop,
    buildSandboxResourceAdapter: vi.fn(() => ({ stop }))
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter
}));

beforeAll(async () => {
  await Promise.all([
    MongoSandboxInstance.syncIndexes(),
    MongoDurableSagaInstance.syncIndexes(),
    MongoDurableSagaReservation.syncIndexes()
  ]);
});

describe('sandboxStopSagaDefinition', () => {
  it('publishes stopped only after the Provider effect is checkpointed', async () => {
    const lastActiveAt = new Date('2026-07-01T00:00:00.000Z');
    const resource = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'durable-stop-sandbox',
      sourceType: 'app',
      sourceId: 'durable-stop-app',
      userId: 'durable-stop-user',
      status: 'running',
      lastActiveAt,
      createdAt: lastActiveAt,
      metadata: { upstreamId: 'durable-stop-upstream' }
    });
    const registry = createSagaRegistry<ClientSession>();
    registry.register(sandboxStopSagaDefinition);
    registry.seal();
    const engine = createSagaEngine({
      store: createMongoDurableSagaStore(),
      registry,
      idGenerator: { nextId: () => 'durable-stop-execution' },
      heartbeatIntervalMs: 100,
      executionStaleMs: 1_000
    });

    const started = await engine.start(sandboxStopSagaDefinition, {
      sagaId: 'durable-stop-saga',
      input: {
        resourceId: resource._id.toString(),
        provider: 'opensandbox',
        sandboxId: 'durable-stop-sandbox',
        sourceType: 'app',
        sourceId: 'durable-stop-app',
        upstreamId: 'durable-stop-upstream',
        lastActiveAt
      },
      run: true
    });

    expect(started.runResult?.type).toBe('completed');
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.buildSandboxResourceAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ upstreamId: 'durable-stop-upstream' })
    );
    const stopped = await MongoSandboxInstance.findById(resource._id)
      .select('-_id status metadata')
      .lean();
    expect(stopped).toMatchObject({
      status: 'stopped',
      metadata: { upstreamId: 'durable-stop-upstream' }
    });
    expect(stopped).not.toHaveProperty('metadata.activeSaga');
    expect(
      await MongoDurableSagaReservation.countDocuments({ ownerSagaId: 'durable-stop-saga' })
    ).toBe(0);
  });

  it('does not claim a record whose lastActiveAt changed', async () => {
    const actualLastActiveAt = new Date('2026-07-02T00:00:00.000Z');
    const resource = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'durable-stop-touched',
      sourceType: 'app',
      sourceId: 'durable-stop-touched-app',
      userId: 'durable-stop-touched-user',
      status: 'running',
      lastActiveAt: actualLastActiveAt,
      createdAt: actualLastActiveAt,
      metadata: {}
    });
    const registry = createSagaRegistry<ClientSession>();
    registry.register(sandboxStopSagaDefinition);
    registry.seal();
    const engine = createSagaEngine({
      store: createMongoDurableSagaStore(),
      registry,
      heartbeatIntervalMs: 100,
      executionStaleMs: 1_000
    });

    await expect(
      engine.start(sandboxStopSagaDefinition, {
        sagaId: 'durable-stop-stale-command',
        input: {
          resourceId: resource._id.toString(),
          provider: 'opensandbox',
          sandboxId: 'durable-stop-touched',
          sourceType: 'app',
          sourceId: 'durable-stop-touched-app',
          lastActiveAt: new Date('2026-07-01T00:00:00.000Z')
        }
      })
    ).rejects.toThrow('could not claim the current running aggregate');
    expect(
      await MongoDurableSagaInstance.countDocuments({ sagaId: 'durable-stop-stale-command' })
    ).toBe(0);
    expect(
      await MongoDurableSagaReservation.countDocuments({
        ownerSagaId: 'durable-stop-stale-command'
      })
    ).toBe(0);
  });
});
