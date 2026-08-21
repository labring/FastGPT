import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

const authCertMock = vi.hoisted(() => vi.fn());

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: authCertMock
}));

import handler, { runInitAppResourcesMigration } from '@/pages/api/admin/4161/initAppResources';

const teamId = new Types.ObjectId('65f000000000000000000061');
const tmbId = new Types.ObjectId('65f000000000000000000062');
const appId = new Types.ObjectId('65f000000000000000000063');
const versionId = new Types.ObjectId('65f000000000000000000064');

const createLegacyRecords = ({
  currentAppId = appId,
  currentVersionId = versionId
}: {
  currentAppId?: Types.ObjectId;
  currentVersionId?: Types.ObjectId;
} = {}) => ({
  app: {
    _id: currentAppId,
    teamId,
    tmbId,
    name: 'Legacy app',
    type: 'workflow',
    modules: [],
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
    nodes: [],
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

describe('initAppResources migration API', () => {
  beforeEach(async () => {
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
    const appBulkWriteSpy = vi.spyOn(MongoApp.collection, 'bulkWrite');
    const versionBulkWriteSpy = vi.spyOn(MongoAppVersion.collection, 'bulkWrite');
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
    expect(appBulkWriteSpy).toHaveBeenCalledTimes(6);
    expect(versionBulkWriteSpy).toHaveBeenCalledTimes(6);
    expect(
      appBulkWriteSpy.mock.calls.slice(0, 3).every(([operations]) => {
        const update = operations[0]?.updateOne.update;
        return operations.length === 1 && '$set' in update && !('$unset' in update);
      })
    ).toBe(true);
    expect(
      appBulkWriteSpy.mock.calls.slice(3).every(([operations]) => {
        const update = operations[0]?.updateOne.update;
        return operations.length === 1 && '$unset' in update && !('$set' in update);
      })
    ).toBe(true);
    expect(
      versionBulkWriteSpy.mock.calls.slice(0, 3).every(([operations]) => {
        const update = operations[0]?.updateOne.update;
        return operations.length === 1 && '$set' in update && !('$unset' in update);
      })
    ).toBe(true);
    expect(
      versionBulkWriteSpy.mock.calls.slice(3).every(([operations]) => {
        const update = operations[0]?.updateOne.update;
        return operations.length === 1 && '$unset' in update && !('$set' in update);
      })
    ).toBe(true);
    expect(await MongoApp.collection.findOne({ _id: records[0].app._id })).toMatchObject({
      resources: [{ type: 'skill', id: 'published-skill' }]
    });
    expect(await MongoAppVersion.collection.findOne({ _id: records[0].version._id })).toMatchObject(
      {
        resources: [{ type: 'skill', id: 'published-skill' }]
      }
    );
    expect(await MongoApp.countDocuments({ resourceRefs: { $exists: true } })).toBe(0);
    expect(await MongoAppVersion.countDocuments({ resourceRefs: { $exists: true } })).toBe(0);
  });

  it('authenticates the admin handler before parsing the migration body', async () => {
    const error = new Error('unauthorized');
    authCertMock.mockRejectedValue(error);

    await expect(handler({ body: { dryRun: 'invalid' }, method: 'POST' } as any)).rejects.toBe(
      error
    );

    expect(authCertMock).toHaveBeenCalledWith(expect.objectContaining({ authRoot: true }));
  });
});
