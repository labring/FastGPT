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

import handler, { runInitAppResourcesMigration } from '@/pages/api/admin/4160/initAppResources';

const teamId = new Types.ObjectId('65f000000000000000000061');
const tmbId = new Types.ObjectId('65f000000000000000000062');
const appId = new Types.ObjectId('65f000000000000000000063');
const versionId = new Types.ObjectId('65f000000000000000000064');

const createLegacyRecords = () => ({
  app: {
    _id: appId,
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
    _id: versionId,
    appId,
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

describe('initAppResources migration API', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('dry-runs without writing App or App Version resources', async () => {
    const { app, version } = createLegacyRecords();
    await MongoApp.collection.insertOne(app);
    await MongoAppVersion.collection.insertOne(version);

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

  it('writes resources and removes legacy resource references when dryRun is false', async () => {
    const { app, version } = createLegacyRecords();
    await MongoApp.collection.insertOne(app);
    await MongoAppVersion.collection.insertOne(version);

    const result = await runInitAppResourcesMigration({ dryRun: false });

    expect(result).toMatchObject({
      dryRun: false,
      stats: {
        appsScanned: 1,
        versionsScanned: 1,
        appsUpdated: 1,
        versionsUpdated: 1
      }
    });
    expect(await MongoApp.collection.findOne({ _id: appId })).toMatchObject({
      resources: [{ type: 'skill', id: 'published-skill' }]
    });
    expect(await MongoAppVersion.collection.findOne({ _id: versionId })).toMatchObject({
      resources: [{ type: 'skill', id: 'published-skill' }]
    });
    expect(
      await MongoApp.collection.findOne({ _id: appId, resourceRefs: { $exists: true } })
    ).toBeNull();
    expect(
      await MongoAppVersion.collection.findOne({ _id: versionId, resourceRefs: { $exists: true } })
    ).toBeNull();
  });

  it('authenticates the admin handler before parsing the migration body', async () => {
    authCertMock.mockResolvedValue(undefined);

    await handler({ body: {}, method: 'POST' } as any);

    expect(authCertMock).toHaveBeenCalledWith(expect.objectContaining({ authRoot: true }));
  });
});
