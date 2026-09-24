import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as appResourcePermission from '@fastgpt/service/support/permission/app/resource';
import {
  initializeAppVersionSnapshot,
  readAppVersionResourceBatch,
  readAppVersionResourceRecord,
  recomputeAppVersionResourceRecords,
  validateAppVersionResourceRecords,
  RECOMPUTE_RESOURCE_CUTOFF_TIME
} from '@/migration/tasks/20260924_recompute_app_resource_snapshots/service';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const teamId = new Types.ObjectId('65f000000000000000000071');
const ownerTmbId = new Types.ObjectId('65f000000000000000000072');
const creatorTmbId = new Types.ObjectId('65f000000000000000000073');

const createApp = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  teamId,
  tmbId: ownerTmbId,
  name: 'Legacy app',
  type: 'advanced',
  modules: [],
  edges: [],
  chatConfig: {},
  resourceRefs: { skillIds: ['legacy-skill'] },
  ...overrides
});

const createVersion = ({
  appId,
  ...overrides
}: { appId: Types.ObjectId } & Record<string, unknown>) => ({
  _id: new Types.ObjectId(),
  appId,
  tmbId: creatorTmbId,
  time: new Date('2026-08-20T00:00:00.000Z'),
  isPublish: true,
  nodes: [],
  edges: [],
  chatConfig: {},
  resources: [{ type: 'skill', id: 'wrong-old-skill' }],
  resourceRefs: { skillIds: ['published-skill'] },
  ...overrides
});

describe('Recompute app resource snapshots service', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(appResourcePermission, 'filterAuthorizedAppResources').mockImplementation(
      async ({ resources }) => resources
    );
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('recomputes Version resources using App Owner tmbId and overwrites existing snapshots', async () => {
    let passedTmbId: unknown;
    vi.spyOn(appResourcePermission, 'filterAuthorizedAppResources').mockImplementation(
      async ({ resources, tmbId }) => {
        passedTmbId = tmbId;
        return resources;
      }
    );

    const app = createApp();
    const version = createVersion({
      appId: app._id,
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'appModule',
          name: 'Target Agent',
          pluginId: 'target-agent-id',
          inputs: [],
          outputs: []
        }
      ]
    });

    await Promise.all([
      MongoApp.collection.insertOne(app),
      MongoAppVersion.collection.insertOne(version)
    ]);

    const result = await recomputeAppVersionResourceRecords([version]);
    expect(result.updatedCount).toBe(1);
    expect(result.failures).toHaveLength(0);

    // 验证鉴权使用的是 App Owner tmbId
    expect(String(passedTmbId)).toBe(String(ownerTmbId));

    const updated = await MongoAppVersion.collection.findOne({ _id: version._id });
    expect(updated?.resources).toEqual([
      { type: 'agent', id: 'target-agent-id' },
      { type: 'skill', id: 'published-skill' }
    ]);
  });

  it('fails when app is missing or app has no tmbId without fallback', async () => {
    const orphanVersion = createVersion({
      appId: new Types.ObjectId(),
      nodes: []
    });

    const appWithoutTmbId = createApp({ tmbId: undefined });
    const versionWithInvalidApp = createVersion({
      appId: appWithoutTmbId._id,
      nodes: []
    });

    await Promise.all([
      MongoApp.collection.insertOne(appWithoutTmbId),
      MongoAppVersion.collection.insertMany([orphanVersion, versionWithInvalidApp])
    ]);

    const result = await recomputeAppVersionResourceRecords([orphanVersion, versionWithInvalidApp]);

    expect(result.updatedCount).toBe(0);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].message).toContain('Cannot find app owner tmbId');
    expect(result.failures[1].message).toContain('Cannot find app owner tmbId');
  });

  it('validates invalid snapshots and reports failures', () => {
    const version = createVersion({
      appId: new Types.ObjectId(),
      resources: [{ type: 'invalid_type', id: 'foo' }]
    });

    const failures = validateAppVersionResourceRecords([version]);
    expect(failures).toHaveLength(1);
    expect(failures[0].message).toContain('invalid_union');
  });

  it('only queries and snapshots versions created before cutoff time (2026-09-23T11:00:00.000Z)', async () => {
    const app = createApp();
    const oldVersion = createVersion({
      appId: app._id,
      time: new Date('2026-09-23T10:59:59.000Z')
    });
    const newVersion = createVersion({
      appId: app._id,
      time: new Date('2026-09-23T11:00:00.000Z')
    });
    const futureVersion = createVersion({
      appId: app._id,
      time: new Date('2026-09-24T00:00:00.000Z')
    });

    await Promise.all([
      MongoApp.collection.insertOne(app),
      MongoAppVersion.collection.insertMany([oldVersion, newVersion, futureVersion])
    ]);

    const snapshot = await initializeAppVersionSnapshot();
    expect(snapshot.total).toBe(1);
    expect(snapshot.endId).toBe(String(oldVersion._id));

    const batch = await readAppVersionResourceBatch({
      endId: null,
      lastId: null,
      limit: 10
    });
    expect(batch).toHaveLength(1);
    expect(String(batch[0]._id)).toBe(String(oldVersion._id));

    const oldRecord = await readAppVersionResourceRecord(String(oldVersion._id));
    expect(oldRecord).not.toBeNull();

    const newRecord = await readAppVersionResourceRecord(String(newVersion._id));
    expect(newRecord).toBeNull();
  });
});
