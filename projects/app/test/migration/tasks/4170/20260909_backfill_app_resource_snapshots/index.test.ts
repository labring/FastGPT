import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationProgressInput
} from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { backfillAppResourceSnapshots } from '@/migration/tasks/4170/20260909_backfill_app_resource_snapshots';
import type { SystemMigrationContext } from '@/migration/registry';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const teamId = new Types.ObjectId('65f000000000000000000061');
const tmbId = new Types.ObjectId('65f000000000000000000062');

const createLegacyRecords = ({
  appId = new Types.ObjectId(),
  versionId = new Types.ObjectId(),
  appModules = [],
  versionNodes = []
}: {
  appId?: Types.ObjectId;
  versionId?: Types.ObjectId;
  appModules?: unknown[];
  versionNodes?: unknown[];
} = {}) => ({
  app: {
    _id: appId,
    teamId,
    tmbId,
    name: 'Legacy app',
    type: 'advanced',
    modules: appModules,
    edges: [],
    chatConfig: {},
    resourceRefs: { skillIds: ['legacy-skill'] }
  },
  version: {
    _id: versionId,
    appId,
    tmbId,
    time: new Date('2026-08-20T00:00:00.000Z'),
    isPublish: true,
    versionName: 'Published version',
    nodes: versionNodes,
    edges: [],
    chatConfig: {},
    resourceRefs: { skillIds: ['published-skill'] }
  }
});

const createContext = ({
  beforeSaveCheckpoint,
  initialCheckpoint,
  initialFailedRecords = []
}: {
  beforeSaveCheckpoint?: (callCount: number) => Promise<void>;
  initialCheckpoint?: Record<string, unknown>;
  initialFailedRecords?: SystemMigrationFailedRecord[];
} = {}) => {
  let checkpoint = initialCheckpoint;
  let failedRecords = structuredClone(initialFailedRecords);
  const progress: SystemMigrationProgressInput[] = [];
  const persistenceEvents: string[] = [];
  let saveCheckpointCallCount = 0;

  const context = {
    migrationId: '20260909_backfill_app_resource_snapshots',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    getFailedRecords: async () => structuredClone(failedRecords),
    reportFailedRecords: vi.fn(async (records: SystemMigrationFailedRecord[]) => {
      failedRecords = structuredClone(records);
      persistenceEvents.push(`failed:${records.length}`);
    }),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      saveCheckpointCallCount += 1;
      await beforeSaveCheckpoint?.(saveCheckpointCallCount);
      checkpoint = structuredClone(value);
      const versions = value.stages as { versions?: { processedCount?: number } } | undefined;
      persistenceEvents.push(`checkpoint:${versions?.versions?.processedCount ?? 0}`);
    }),
    reportProgress: vi.fn(async (value: SystemMigrationProgressInput) => {
      progress.push(value);
    }),
    assertActive: vi.fn(async () => undefined),
    fail: vi.fn(async (error) => {
      if (error.failedRecords) failedRecords = structuredClone(error.failedRecords);
      throw new Error(error.message);
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  } satisfies SystemMigrationContext;

  return {
    context,
    getCheckpoint: () => checkpoint,
    getFailedRecords: () => failedRecords,
    getProgress: () => progress,
    getPersistenceEvents: () => persistenceEvents
  };
};

describe('4170 App resource snapshot migration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('backfills Version resources and the App published pointer with complete progress', async () => {
    const records = createLegacyRecords();
    await Promise.all([
      MongoApp.collection.insertOne(records.app),
      MongoAppVersion.collection.insertOne(records.version)
    ]);
    const state = createContext();

    await expect(backfillAppResourceSnapshots(state.context)).resolves.toEqual({
      versionsProcessedCount: 1,
      appsProcessedCount: 1
    });

    await expect(
      MongoAppVersion.collection.findOne({ _id: records.version._id })
    ).resolves.toMatchObject({
      resources: [{ type: 'skill', id: 'published-skill' }],
      resourceRefs: records.version.resourceRefs
    });
    await expect(MongoApp.collection.findOne({ _id: records.app._id })).resolves.toMatchObject({
      publishedVersionId: records.version._id,
      modules: records.app.modules,
      resourceRefs: records.app.resourceRefs
    });
    expect(state.getProgress()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'versions', status: SystemMigrationStatusEnum.running }),
        expect.objectContaining({ key: 'versions', status: SystemMigrationStatusEnum.succeeded }),
        expect.objectContaining({ key: 'apps', status: SystemMigrationStatusEnum.running }),
        expect.objectContaining({ key: 'apps', status: SystemMigrationStatusEnum.succeeded }),
        { key: 'validation', status: SystemMigrationStatusEnum.running },
        { key: 'validation', status: SystemMigrationStatusEnum.succeeded }
      ])
    );
    expect(state.getFailedRecords()).toEqual([]);
  });

  it('is idempotent when the complete task is replayed', async () => {
    const records = createLegacyRecords();
    await Promise.all([
      MongoApp.collection.insertOne(records.app),
      MongoAppVersion.collection.insertOne(records.version)
    ]);
    await backfillAppResourceSnapshots(createContext().context);
    const versionCount = await MongoAppVersion.countDocuments({ appId: records.app._id });

    await expect(backfillAppResourceSnapshots(createContext().context)).resolves.toMatchObject({
      versionsProcessedCount: 1,
      appsProcessedCount: 1
    });
    await expect(MongoAppVersion.countDocuments({ appId: records.app._id })).resolves.toBe(
      versionCount
    );
  });

  it('resumes safely after business data is written but checkpoint persistence fails', async () => {
    const records = createLegacyRecords();
    await Promise.all([
      MongoApp.collection.insertOne(records.app),
      MongoAppVersion.collection.insertOne(records.version)
    ]);
    const state = createContext({
      beforeSaveCheckpoint: async (callCount) => {
        if (callCount === 2) throw new Error('checkpoint unavailable');
      }
    });

    await expect(backfillAppResourceSnapshots(state.context)).rejects.toThrow(
      'checkpoint unavailable'
    );
    await expect(
      MongoAppVersion.collection.findOne({ _id: records.version._id })
    ).resolves.toMatchObject({
      resources: [{ type: 'skill', id: 'published-skill' }]
    });
    expect(state.getCheckpoint()).toMatchObject({
      stages: { versions: { processedCount: 0, lastId: null } }
    });

    await expect(backfillAppResourceSnapshots(state.context)).resolves.toMatchObject({
      versionsProcessedCount: 1,
      appsProcessedCount: 1
    });
  });

  it('retries failed Version records before the completed scan range', async () => {
    const records = createLegacyRecords();
    await Promise.all([
      MongoApp.collection.insertOne(records.app),
      MongoAppVersion.collection.insertOne(records.version)
    ]);
    const state = createContext();
    const originalUpdateOne = MongoAppVersion.collection.updateOne.bind(MongoAppVersion.collection);
    let changed = false;
    vi.spyOn(MongoAppVersion.collection, 'updateOne').mockImplementation(
      async (filter, update, options) => {
        if (!changed) {
          changed = true;
          await originalUpdateOne(
            { _id: records.version._id },
            { $set: { nodes: [{ nodeId: 'changed-after-read' }] } }
          );
        }
        return originalUpdateOne(filter, update, options);
      }
    );

    await expect(backfillAppResourceSnapshots(state.context)).rejects.toThrow(
      'App resource records still require migration'
    );
    expect(state.getFailedRecords()).toEqual([
      expect.objectContaining({
        stageKey: 'versions',
        data: expect.objectContaining({ recordId: String(records.version._id) })
      })
    ]);
    const failedSnapshotIndex = state.getPersistenceEvents().indexOf('failed:1');
    const batchCheckpointIndex = state.getPersistenceEvents().indexOf('checkpoint:1');
    expect(failedSnapshotIndex).toBeGreaterThanOrEqual(0);
    expect(batchCheckpointIndex).toBeGreaterThan(failedSnapshotIndex);

    vi.restoreAllMocks();
    await expect(backfillAppResourceSnapshots(state.context)).resolves.toMatchObject({
      versionsProcessedCount: 1,
      appsProcessedCount: 1
    });
    expect(state.getFailedRecords()).toEqual([]);
  });

  it('processes a Version created after the fixed main snapshot in the bounded tail scan', async () => {
    const records = createLegacyRecords();
    const lateVersion = createLegacyRecords({ appId: records.app._id }).version;
    await Promise.all([
      MongoApp.collection.insertOne(records.app),
      MongoAppVersion.collection.insertOne(records.version)
    ]);
    const state = createContext();
    state.context.assertActive.mockImplementationOnce(async () => {
      await MongoAppVersion.collection.insertOne(lateVersion);
    });

    await expect(backfillAppResourceSnapshots(state.context)).resolves.toMatchObject({
      versionsProcessedCount: 1,
      appsProcessedCount: 1
    });
    await expect(
      MongoAppVersion.countDocuments({ appId: records.app._id, resources: { $type: 'array' } })
    ).resolves.toBe(2);
  });

  it('does not start a business batch after losing the lease', async () => {
    const records = createLegacyRecords();
    await Promise.all([
      MongoApp.collection.insertOne(records.app),
      MongoAppVersion.collection.insertOne(records.version)
    ]);
    const state = createContext();
    state.context.assertActive.mockRejectedValue(new Error('lease lost'));

    await expect(backfillAppResourceSnapshots(state.context)).rejects.toThrow('lease lost');
    await expect(
      MongoAppVersion.collection.findOne({ _id: records.version._id })
    ).resolves.not.toHaveProperty('resources');
    await expect(MongoApp.collection.findOne({ _id: records.app._id })).resolves.not.toHaveProperty(
      'publishedVersionId'
    );
  });

  it('reports non-ObjectId records instead of silently succeeding', async () => {
    await MongoAppVersion.collection.insertOne({
      _id: 'legacy-version-id' as never,
      appId: new Types.ObjectId(),
      tmbId: String(tmbId),
      nodes: [],
      edges: []
    });
    const state = createContext();

    await expect(backfillAppResourceSnapshots(state.context)).rejects.toThrow(
      'App resource records still require migration'
    );
    expect(state.getFailedRecords()).toEqual([
      expect.objectContaining({
        stageKey: 'versions',
        data: { recordId: 'legacy-version-id', recordType: 'app_version' },
        reason: { message: 'Record _id is not an ObjectId' }
      })
    ]);
  });
});
