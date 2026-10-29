import handler from '@/pages/api/core/dataset/collection/resumeInheritPermission';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/service/support/user/audit/util');

describe('resume collection inherit permission api', () => {
  it('does not restore permissions or write audit logs without manage permission', async () => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'denied-audit-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      vectorModelId: 'test-model',
      collectionPermissionEnabled: true
    });
    const collection = await MongoDatasetCollection.create({
      name: 'denied-audit-collection',
      type: DatasetCollectionTypeEnum.file,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.members[0],
      body: { collectionId: String(collection._id) }
    });

    expect(res.code).not.toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });
    await expect(MongoTeamAudit.countDocuments({ teamId: users.owner.teamId })).resolves.toBe(0);
  });

  beforeEach(async () => {
    await MongoTeamAudit.deleteMany({});
  });

  it('writes the dedicated collection event without a generic inheritance event', async () => {
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
          event: DatasetAuditEventEnum.DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME
        }).lean();
        expect(audit).not.toBeNull();
        expect(audit?.resources).toEqual([
          { datasetId: dataset._id },
          { collectionId: collection._id }
        ]);
        expect(audit?.metadata).toEqual({
          datasetName: 'audit-dataset',
          collectionName: 'audit-collection',
          parentResource: 'audit-dataset'
        });
        await expect(
          MongoTeamAudit.countDocuments({
            teamId: users.owner.teamId,
            event: AuditEventEnum.RESUME_INHERIT_PERMISSION
          })
        ).resolves.toBe(0);
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
          event: DatasetAuditEventEnum.DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME
        }).lean();
        expect(audit?.resources).toEqual([
          { datasetId: dataset._id },
          { collectionId: collection._id }
        ]);
        expect(audit?.metadata).toEqual({
          datasetName: 'nested-audit-dataset',
          collectionName: 'nested-audit-collection',
          ...(parentExists ? { parentResource: 'audit-folder' } : {})
        });
      },
      { timeout: 5000 }
    );
  });
});
