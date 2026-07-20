import { createSagaEngine, createSagaRegistry } from '@fastgpt-sdk/durable-saga';
import {
  createMongoDurableSagaStore,
  MongoDurableSagaInstance,
  MongoDurableSagaReservation
} from '@fastgpt/service/common/durableSaga';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import {
  sandboxArchiveSagaDefinition,
  sandboxDeleteSagaDefinition,
  sandboxProviderMigrationSagaDefinition
} from '@fastgpt/service/core/ai/sandbox/application/lifecycle/definitions';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const providerDelete = vi.fn(async () => undefined);
  return {
    uploadArchive: vi.fn(async () => undefined),
    deleteArchivedRemote: vi.fn(async () => undefined),
    providerDelete,
    volumeDelete: vi.fn(async () => undefined),
    archiveDelete: vi.fn(async () => undefined),
    getArchiveKey: vi.fn(async () => undefined as string | undefined),
    buildSandboxResourceAdapter: vi.fn(() => ({
      stop: vi.fn(async () => undefined),
      delete: providerDelete
    }))
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: vi.fn(async () => undefined)
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => ({
  uploadSandboxWorkspaceArchive: mocks.uploadArchive,
  deleteArchivedRemoteResource: mocks.deleteArchivedRemote
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service', () => ({
  deleteSessionVolume: mocks.volumeDelete
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    deleteWorkspaceArchive: mocks.archiveDelete,
    getWorkspaceArchiveIdempotencyKey: mocks.getArchiveKey
  })
}));

beforeAll(async () => {
  await Promise.all([
    MongoSandboxInstance.syncIndexes(),
    MongoDurableSagaInstance.syncIndexes(),
    MongoDurableSagaReservation.syncIndexes()
  ]);
});

beforeEach(() => {
  vi.clearAllMocks();
});

const createEngine = (
  ...definitions: Array<
    | typeof sandboxArchiveSagaDefinition
    | typeof sandboxDeleteSagaDefinition
    | typeof sandboxProviderMigrationSagaDefinition
  >
) => {
  const registry = createSagaRegistry<ClientSession>();
  for (const definition of definitions) registry.register(definition);
  registry.seal();
  return createSagaEngine({
    store: createMongoDurableSagaStore(),
    registry,
    heartbeatIntervalMs: 100,
    executionStaleMs: 1_000
  });
};

describe('sandboxArchiveSagaDefinition', () => {
  it('uploads before Provider deletion and publishes archived last', async () => {
    const lastActiveAt = new Date('2026-06-01T00:00:00.000Z');
    const resource = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'durable-archive-sandbox',
      sourceType: 'app',
      sourceId: 'durable-archive-app',
      userId: 'durable-archive-user',
      status: 'stopped',
      lastActiveAt,
      createdAt: lastActiveAt,
      metadata: { upstreamId: 'durable-archive-upstream' }
    });
    const engine = createEngine(sandboxArchiveSagaDefinition);

    const result = await engine.start(sandboxArchiveSagaDefinition, {
      sagaId: 'durable-archive-saga',
      input: {
        resourceId: resource._id.toString(),
        provider: 'opensandbox',
        sandboxId: 'durable-archive-sandbox',
        sourceType: 'app',
        sourceId: 'durable-archive-app',
        upstreamId: 'durable-archive-upstream',
        expectedStatus: 'stopped',
        lastActiveAt,
        image: { repository: 'runtime/image', tag: 'v1' }
      },
      run: true
    });

    expect(result.runResult?.type).toBe('completed');
    expect(mocks.uploadArchive).toHaveBeenCalledWith({
      resource: expect.objectContaining({ sandboxId: 'durable-archive-sandbox' }),
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(mocks.deleteArchivedRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ upstreamId: 'durable-archive-upstream' })
      })
    );
    const archived = await MongoSandboxInstance.findById(resource._id)
      .select('-_id status metadata')
      .lean();
    expect(archived).toMatchObject({
      status: 'archived',
      metadata: { image: { repository: 'runtime/image', tag: 'v1' } }
    });
    expect(archived).not.toHaveProperty('metadata.upstreamId');
  });
});

describe('sandboxProviderMigrationSagaDefinition', () => {
  it('keeps archive and provider CAS in one Saga instance', async () => {
    const lastActiveAt = new Date('2026-06-03T00:00:00.000Z');
    const resource = await MongoSandboxInstance.create({
      provider: 'sealosdevbox',
      sandboxId: 'durable-migration-sandbox',
      sourceType: 'app',
      sourceId: 'durable-migration-app',
      userId: 'durable-migration-user',
      status: 'running',
      lastActiveAt,
      createdAt: lastActiveAt,
      metadata: { upstreamId: 'durable-migration-upstream' }
    });
    const engine = createEngine(sandboxProviderMigrationSagaDefinition);

    const result = await engine.start(sandboxProviderMigrationSagaDefinition, {
      sagaId: 'durable-provider-migration-saga',
      input: {
        resourceId: resource._id.toString(),
        provider: 'sealosdevbox',
        targetProvider: 'opensandbox',
        sandboxId: 'durable-migration-sandbox',
        sourceType: 'app',
        sourceId: 'durable-migration-app',
        upstreamId: 'durable-migration-upstream',
        expectedStatus: 'running',
        lastActiveAt,
        targetImage: { repository: 'target/runtime', tag: 'v2' }
      },
      run: true
    });

    expect(result.runResult?.type).toBe('completed');
    expect(mocks.uploadArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({ sandboxId: 'durable-migration-sandbox' })
      })
    );
    expect(mocks.deleteArchivedRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ upstreamId: 'durable-migration-upstream' })
      })
    );
    const migrated = await MongoSandboxInstance.findById(resource._id)
      .select('-_id provider status metadata')
      .lean();
    expect(migrated).toMatchObject({
      provider: 'opensandbox',
      status: 'archived',
      metadata: {
        image: { repository: 'target/runtime', tag: 'v2' }
      }
    });
    expect(migrated).not.toHaveProperty('metadata.activeSaga');
    expect(migrated).not.toHaveProperty('metadata.upstreamId');
    expect(
      await MongoDurableSagaInstance.countDocuments({
        sagaId: 'durable-provider-migration-saga',
        name: 'sandbox.provider-migration'
      })
    ).toBe(1);
  });
});

describe('sandboxDeleteSagaDefinition', () => {
  it('removes the record only after Provider, Volume and archive cleanup checkpoints', async () => {
    const lastActiveAt = new Date('2026-06-02T00:00:00.000Z');
    const resource = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'durable-delete-sandbox',
      sourceType: 'app',
      sourceId: 'durable-delete-app',
      userId: 'durable-delete-user',
      status: 'archived',
      lastActiveAt,
      createdAt: lastActiveAt,
      metadata: { upstreamId: 'durable-delete-upstream' }
    });
    const engine = createEngine(sandboxDeleteSagaDefinition);

    const result = await engine.start(sandboxDeleteSagaDefinition, {
      sagaId: 'durable-delete-saga',
      input: {
        resourceId: resource._id.toString(),
        provider: 'opensandbox',
        sandboxId: 'durable-delete-sandbox',
        sourceType: 'app',
        sourceId: 'durable-delete-app',
        upstreamId: 'durable-delete-upstream',
        expectedStatus: 'archived',
        lastActiveAt
      },
      run: true
    });

    expect(result.runResult?.type).toBe('completed');
    expect(mocks.providerDelete).toHaveBeenCalledOnce();
    expect(mocks.buildSandboxResourceAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ upstreamId: 'durable-delete-upstream' })
    );
    expect(mocks.volumeDelete).toHaveBeenCalledWith('durable-delete-sandbox');
    expect(mocks.archiveDelete).toHaveBeenCalledWith({ sandboxId: 'durable-delete-sandbox' });
    expect(await MongoSandboxInstance.countDocuments({ _id: resource._id })).toBe(0);
    expect(
      await MongoDurableSagaReservation.countDocuments({ ownerSagaId: 'durable-delete-saga' })
    ).toBe(0);
  });
});
