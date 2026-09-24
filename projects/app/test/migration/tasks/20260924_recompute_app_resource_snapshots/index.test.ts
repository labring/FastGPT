import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationProgressInput
} from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { recomputeAppResourceSnapshots } from '@/migration/tasks/20260924_recompute_app_resource_snapshots';
import type { SystemMigrationContext } from '@/migration/registry';
import * as appResourcePermission from '@fastgpt/service/support/permission/app/resource';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const teamId = new Types.ObjectId('65f000000000000000000061');
const ownerTmbId = new Types.ObjectId('65f000000000000000000062');
const creatorTmbId = new Types.ObjectId('65f000000000000000000063');

const createRecords = ({
  appId = new Types.ObjectId(),
  versionId = new Types.ObjectId()
}: {
  appId?: Types.ObjectId;
  versionId?: Types.ObjectId;
} = {}) => ({
  app: {
    _id: appId,
    teamId,
    tmbId: ownerTmbId,
    name: 'Legacy app',
    type: 'advanced',
    modules: [],
    edges: [],
    chatConfig: {},
    resourceRefs: { skillIds: ['legacy-skill'] }
  },
  version: {
    _id: versionId,
    appId,
    tmbId: creatorTmbId,
    time: new Date('2026-08-20T00:00:00.000Z'),
    isPublish: true,
    versionName: 'Published version',
    nodes: [
      {
        nodeId: 'node-1',
        flowNodeType: 'appModule',
        name: 'Target Agent',
        pluginId: 'target-agent-id',
        inputs: [],
        outputs: []
      }
    ],
    edges: [],
    chatConfig: {},
    resources: [{ type: 'skill', id: 'wrong-old-skill' }],
    resourceRefs: { skillIds: ['published-skill'] }
  }
});

const createContext = ({
  initialCheckpoint,
  initialFailedRecords = []
}: {
  initialCheckpoint?: Record<string, unknown>;
  initialFailedRecords?: SystemMigrationFailedRecord[];
} = {}) => {
  let checkpoint = initialCheckpoint;
  let failedRecords = structuredClone(initialFailedRecords);
  const progress: SystemMigrationProgressInput[] = [];

  const context = {
    migrationId: '20260924_recompute_app_resource_snapshots',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    getFailedRecords: async () => structuredClone(failedRecords),
    reportFailedRecords: vi.fn(async (records: SystemMigrationFailedRecord[]) => {
      failedRecords = structuredClone(records);
    }),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
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

  return { context, getSavedCheckpoint: () => checkpoint, getFailedRecords: () => failedRecords };
};

describe('recomputeAppResourceSnapshots task', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(appResourcePermission, 'filterAuthorizedAppResources').mockImplementation(
      async ({ resources }) => resources
    );
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('runs complete lifecycle and recomputes all version resources', async () => {
    const pair1 = createRecords();
    const pair2 = createRecords();

    await Promise.all([
      MongoApp.collection.insertMany([pair1.app, pair2.app]),
      MongoAppVersion.collection.insertMany([pair1.version, pair2.version])
    ]);

    const { context, getSavedCheckpoint } = createContext();
    const result = await recomputeAppResourceSnapshots(context);

    expect(result).toEqual({ processedCount: 2 });
    expect(getSavedCheckpoint()).toMatchObject({
      completed: true,
      processedCount: 2
    });

    const [v1, v2] = await Promise.all([
      MongoAppVersion.collection.findOne({ _id: pair1.version._id }),
      MongoAppVersion.collection.findOne({ _id: pair2.version._id })
    ]);
    expect(v1?.resources).toEqual([
      { type: 'agent', id: 'target-agent-id' },
      { type: 'skill', id: 'published-skill' }
    ]);
    expect(v2?.resources).toEqual([
      { type: 'agent', id: 'target-agent-id' },
      { type: 'skill', id: 'published-skill' }
    ]);
  });

  it('only recomputes versions created before 2026-09-23T11:00:00.000Z', async () => {
    const oldPair = createRecords();
    oldPair.version.time = new Date('2026-09-23T10:00:00.000Z');

    const newPair = createRecords();
    newPair.version.time = new Date('2026-09-23T12:00:00.000Z');
    newPair.version.resources = [{ type: 'skill', id: 'untouched-new-skill' }];

    await Promise.all([
      MongoApp.collection.insertMany([oldPair.app, newPair.app]),
      MongoAppVersion.collection.insertMany([oldPair.version, newPair.version])
    ]);

    const { context } = createContext();
    const result = await recomputeAppResourceSnapshots(context);

    expect(result).toEqual({ processedCount: 1 });

    const [oldV, newV] = await Promise.all([
      MongoAppVersion.collection.findOne({ _id: oldPair.version._id }),
      MongoAppVersion.collection.findOne({ _id: newPair.version._id })
    ]);

    expect(oldV?.resources).toEqual([
      { type: 'agent', id: 'target-agent-id' },
      { type: 'skill', id: 'published-skill' }
    ]);
    // 新版本未被修改
    expect(newV?.resources).toEqual([{ type: 'skill', id: 'untouched-new-skill' }]);
  });
});
