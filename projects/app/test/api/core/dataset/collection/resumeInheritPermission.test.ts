import handler from '@/pages/api/core/dataset/collection/resumeInheritPermission';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/service/support/user/audit/util');

describe('resume collection inherit permission api', () => {
  beforeEach(async () => {
    await MongoTeamAudit.deleteMany({});
  });

  it('writes a dataset audit for a root collection', async () => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'audit-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      vectorModelId: 'test-model',
      collectionPermissionEnabled: true
    });
    const collection = await MongoDatasetCollection.create({
      name: 'audit-collection',
      type: DatasetCollectionTypeEnum.file,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.owner,
      body: { collectionId: String(collection._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toMatchObject({
      inheritPermission: true
    });

    await vi.waitFor(
      async () => {
        const audit = await MongoTeamAudit.findOne({
          teamId: users.owner.teamId,
          event: AuditEventEnum.RESUME_INHERIT_PERMISSION
        }).lean();
        expect(audit).not.toBeNull();
        expect(audit?.resources).toEqual([
          { datasetId: dataset._id },
          { collectionId: collection._id }
        ]);
        expect(audit?.metadata).toEqual({
          targetResource: 'audit-collection',
          parentResource: 'audit-dataset'
        });
      },
      { timeout: 5000 }
    );
  });

  it.each([true, false])('records the available parent name (%s)', async (parentExists) => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'nested-audit-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      vectorModelId: 'test-model',
      collectionPermissionEnabled: true
    });
    const parent = await MongoDatasetCollection.create({
      name: 'audit-folder',
      type: DatasetCollectionTypeEnum.folder,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      inheritPermission: true
    });
    const collection = await MongoDatasetCollection.create({
      name: 'nested-audit-collection',
      type: DatasetCollectionTypeEnum.file,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      parentId: parent._id,
      inheritPermission: false
    });

    if (!parentExists) {
      await MongoDatasetCollection.deleteOne({ _id: parent._id });
    }

    const res = await Call(handler, {
      auth: users.owner,
      body: { collectionId: String(collection._id) }
    });

    expect(res.code).toBe(200);

    await vi.waitFor(
      async () => {
        const audit = await MongoTeamAudit.findOne({
          teamId: users.owner.teamId,
          event: AuditEventEnum.RESUME_INHERIT_PERMISSION
        }).lean();
        expect(audit?.resources).toEqual([
          { datasetId: dataset._id },
          { collectionId: collection._id }
        ]);
        expect(audit?.metadata).toEqual({
          targetResource: 'nested-audit-collection',
          ...(parentExists ? { parentResource: 'audit-folder' } : {})
        });
      },
      { timeout: 5000 }
    );
  });
});
