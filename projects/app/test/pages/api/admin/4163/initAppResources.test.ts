import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

import { runInitAppResourcesMigration } from '@/pages/api/admin/4163/initAppResources';

const teamId = new Types.ObjectId('65f000000000000000000061');
const tmbId = new Types.ObjectId('65f000000000000000000062');
const appId = new Types.ObjectId('65f000000000000000000063');
const versionId = new Types.ObjectId('65f000000000000000000064');

const createLegacyRecords = ({
  currentAppId = appId,
  currentVersionId = versionId,
  appModules = [],
  versionNodes = []
}: {
  currentAppId?: Types.ObjectId;
  currentVersionId?: Types.ObjectId;
  appModules?: unknown[];
  versionNodes?: unknown[];
} = {}) => ({
  app: {
    _id: currentAppId,
    teamId,
    tmbId,
    name: 'Legacy app',
    type: 'workflow',
    modules: appModules,
    edges: [],
    chatConfig: {},
    resourceRefs: {
      skillIds: ['legacy-skill']
    }
  },
  version: {
    _id: currentVersionId,
    appId: currentAppId,
    tmbId,
    time: new Date('2026-08-20T00:00:00.000Z'),
    isPublish: true,
    versionName: 'Published version',
    nodes: versionNodes,
    edges: [],
    chatConfig: {},
    resourceRefs: {
      skillIds: ['published-skill']
    }
  }
});

const insertLegacyRecords = async (records = [createLegacyRecords()]) => {
  await Promise.all([
    MongoApp.collection.insertMany(records.map(({ app }) => app)),
    MongoAppVersion.collection.insertMany(records.map(({ version }) => version))
  ]);
};

const insertLegacyAppWithoutVersions = async (appModules: unknown[] = []) => {
  await MongoApp.collection.insertOne(createLegacyRecords({ appModules }).app);
};

describe('initAppResources migration API', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('dry-runs without writing App or App Version resources', async () => {
    await insertLegacyRecords();

    const result = await runInitAppResourcesMigration({ dryRun: true });

    expect(result).toMatchObject({
      dryRun: true,
      stats: {
        appsScanned: 1,
        versionsScanned: 1,
        appsUpdated: 0,
        versionsUpdated: 0,
        legacySkillRefs: 2
      }
    });
    expect(
      await MongoApp.collection.findOne({ _id: appId }, { projection: { resourceRefs: 1 } })
    ).toMatchObject({ resourceRefs: { skillIds: ['legacy-skill'] } });
    expect(
      await MongoAppVersion.collection.findOne(
        { _id: versionId },
        { projection: { resourceRefs: 1 } }
      )
    ).toMatchObject({ resourceRefs: { skillIds: ['published-skill'] } });
  });

  it('writes resources in batches and removes legacy resource references', async () => {
    const records = Array.from({ length: 3 }, () =>
      createLegacyRecords({
        currentAppId: new Types.ObjectId(),
        currentVersionId: new Types.ObjectId()
      })
    );
    await insertLegacyRecords(records);

    const result = await runInitAppResourcesMigration({
      dryRun: false,
      batchSize: 1,
      writeBatchSize: 1
    });

    expect(result).toMatchObject({
      dryRun: false,
      batchSize: 1,
      writeBatchSize: 1,
      stats: {
        appsScanned: 3,
        versionsScanned: 3,
        appsUpdated: 3,
        versionsUpdated: 3
      }
    });
    expect(await MongoApp.collection.findOne({ _id: records[0].app._id })).toMatchObject({
      publishedVersionId: records[0].version._id
    });
    expect(await MongoApp.collection.findOne({ _id: records[0].app._id })).not.toHaveProperty(
      'modules'
    );
    expect(await MongoAppVersion.collection.findOne({ _id: records[0].version._id })).toMatchObject(
      {
        resources: [{ type: 'skill', id: 'published-skill' }]
      }
    );
    expect(await MongoApp.countDocuments({ resourceRefs: { $exists: true } })).toBe(0);
    expect(await MongoAppVersion.countDocuments({ resourceRefs: { $exists: true } })).toBe(0);
  });

  it('skips records changed after they were read and preserves their retry references', async () => {
    await insertLegacyRecords();

    const originalVersionBulkWrite = MongoAppVersion.collection.bulkWrite.bind(
      MongoAppVersion.collection
    );
    let hasConcurrentChange = false;
    vi.spyOn(MongoAppVersion.collection, 'bulkWrite').mockImplementation(
      async (operations, options) => {
        if (!hasConcurrentChange) {
          hasConcurrentChange = true;
          await MongoAppVersion.collection.updateOne(
            { _id: versionId },
            { $set: { nodes: [{ nodeId: 'changed-after-read' }] } }
          );
        }
        return originalVersionBulkWrite(operations, options);
      }
    );

    const result = await runInitAppResourcesMigration({
      dryRun: false,
      batchSize: 1,
      writeBatchSize: 1
    });

    expect(result).toMatchObject({
      stats: {
        appsScanned: 1,
        versionsScanned: 1,
        appsUpdated: 0,
        versionsUpdated: 0,
        appsSkipped: 1,
        versionsSkipped: 1
      }
    });
    expect(await MongoAppVersion.collection.findOne({ _id: versionId })).toMatchObject({
      nodes: [{ nodeId: 'changed-after-read' }],
      resourceRefs: { skillIds: ['published-skill'] }
    });
    expect(
      await MongoApp.collection.findOne(
        { _id: appId },
        { projection: { resourceRefs: 1, publishedVersionId: 1 } }
      )
    ).toMatchObject({ resourceRefs: { skillIds: ['legacy-skill'] } });
    expect(await MongoAppVersion.countDocuments({ resourceRefs: { $exists: true } })).toBe(1);
    expect(await MongoApp.countDocuments({ resourceRefs: { $exists: true } })).toBe(1);
  });

  it('does not unset App graph after the App changes during migration', async () => {
    await insertLegacyRecords();

    const originalAppBulkWrite = MongoApp.collection.bulkWrite.bind(MongoApp.collection);
    let hasConcurrentChange = false;
    vi.spyOn(MongoApp.collection, 'bulkWrite').mockImplementation(async (operations, options) => {
      if (!hasConcurrentChange) {
        hasConcurrentChange = true;
        await MongoApp.collection.updateOne(
          { _id: appId },
          { $set: { modules: [{ nodeId: 'changed-after-read' }] } }
        );
      }
      return originalAppBulkWrite(operations, options);
    });

    const result = await runInitAppResourcesMigration({
      dryRun: false,
      batchSize: 1,
      writeBatchSize: 1
    });

    expect(result).toMatchObject({
      stats: {
        appsScanned: 1,
        versionsScanned: 1,
        appsUpdated: 0,
        versionsUpdated: 1,
        appsSkipped: 1,
        versionsSkipped: 0
      }
    });
    expect(await MongoApp.collection.findOne({ _id: appId })).toMatchObject({
      modules: [{ nodeId: 'changed-after-read' }],
      resourceRefs: { skillIds: ['legacy-skill'] }
    });
    expect(await MongoAppVersion.collection.findOne({ _id: versionId })).toMatchObject({
      resources: [{ type: 'skill', id: 'published-skill' }]
    });
    expect(await MongoApp.countDocuments({ resourceRefs: { $exists: true } })).toBe(1);
    expect(await MongoAppVersion.countDocuments({ resourceRefs: { $exists: true } })).toBe(0);
  });

  it('does not overwrite a concurrently published version pointer', async () => {
    await insertLegacyRecords();
    const concurrentVersionId = new Types.ObjectId();

    const originalAppBulkWrite = MongoApp.collection.bulkWrite.bind(MongoApp.collection);
    let hasConcurrentChange = false;
    vi.spyOn(MongoApp.collection, 'bulkWrite').mockImplementation(async (operations, options) => {
      if (!hasConcurrentChange) {
        hasConcurrentChange = true;
        await MongoApp.collection.updateOne(
          { _id: appId },
          { $set: { publishedVersionId: concurrentVersionId } }
        );
      }
      return originalAppBulkWrite(operations, options);
    });

    const result = await runInitAppResourcesMigration({
      dryRun: false,
      batchSize: 1,
      writeBatchSize: 1
    });

    expect(result).toMatchObject({
      stats: {
        appsScanned: 1,
        versionsScanned: 1,
        appsUpdated: 0,
        versionsUpdated: 1,
        appsSkipped: 1,
        versionsSkipped: 0
      }
    });
    expect(await MongoApp.collection.findOne({ _id: appId })).toMatchObject({
      publishedVersionId: concurrentVersionId,
      modules: [],
      resourceRefs: { skillIds: ['legacy-skill'] }
    });
  });

  it('creates a published version only when the app has no versions', async () => {
    await insertLegacyAppWithoutVersions([
      {
        id: 'react-flow-node-id',
        nodeId: 'node-1',
        flowNodeType: 'workflowStart',
        name: 'Start',
        inputs: [],
        outputs: []
      }
    ]);

    const result = await runInitAppResourcesMigration({ dryRun: false });

    expect(result).toMatchObject({
      stats: {
        appsScanned: 1,
        versionsScanned: 0,
        appsUpdated: 1,
        versionsUpdated: 1
      }
    });
    const createdVersion = await MongoAppVersion.collection.findOne({ appId });
    expect(createdVersion).toMatchObject({
      isPublish: true,
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {},
      resources: [{ type: 'skill', id: 'legacy-skill' }]
    });
    expect(createdVersion?.nodes?.[0]).not.toHaveProperty('id');
    expect(await MongoApp.collection.findOne({ _id: appId })).toMatchObject({
      publishedVersionId: createdVersion?._id
    });
    expect(await MongoApp.countDocuments({ resourceRefs: { $exists: true } })).toBe(0);
  });

  it('removes a generated version when a zero-version app changes before pointer backfill', async () => {
    await insertLegacyAppWithoutVersions();

    const originalAppBulkWrite = MongoApp.collection.bulkWrite.bind(MongoApp.collection);
    let hasConcurrentChange = false;
    vi.spyOn(MongoApp.collection, 'bulkWrite').mockImplementation(async (operations, options) => {
      if (!hasConcurrentChange) {
        hasConcurrentChange = true;
        await MongoApp.collection.updateOne(
          { _id: appId },
          { $set: { modules: [{ nodeId: 'changed-after-read' }] } }
        );
      }
      return originalAppBulkWrite(operations, options);
    });

    const result = await runInitAppResourcesMigration({
      dryRun: false,
      batchSize: 1,
      writeBatchSize: 1
    });

    expect(result).toMatchObject({
      stats: {
        appsUpdated: 0,
        versionsUpdated: 0,
        appsSkipped: 1
      }
    });
    expect(await MongoAppVersion.countDocuments({ appId })).toBe(0);
    expect(await MongoApp.collection.findOne({ _id: appId })).toMatchObject({
      modules: [{ nodeId: 'changed-after-read' }],
      resourceRefs: { skillIds: ['legacy-skill'] }
    });
  });
});
