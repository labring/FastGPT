import handler from '@/pages/api/core/dataset/collection/resumeInheritPermission';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
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

  it('恢复根集合继承权限时记录知识库作为继承来源', async () => {
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
          event: 'dataset.collection.permission.inheritance_resume'
        }).lean();
        expect(audit).not.toBeNull();
        // 根集合没有父目录，直接继承知识库
        expect(audit?.metadata).toEqual({
          datasetName: 'audit-dataset',
          collectionName: 'audit-collection',
          parentResource: 'audit-dataset'
        });
      },
      { timeout: 5000 }
    );
  });

  it('嵌套集合记录直接父目录作为继承来源', async () => {
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

    const res = await Call(handler, {
      auth: users.owner,
      body: { collectionId: String(collection._id) }
    });

    expect(res.code).toBe(200);

    await vi.waitFor(
      async () => {
        const audit = await MongoTeamAudit.findOne({
          teamId: users.owner.teamId,
          event: 'dataset.collection.permission.inheritance_resume'
        }).lean();
        expect(audit?.metadata).toEqual({
          datasetName: 'nested-audit-dataset',
          collectionName: 'nested-audit-collection',
          parentResource: 'audit-folder'
        });
      },
      { timeout: 5000 }
    );
  });

  it('无管理权限时既不恢复继承也不写审计', async () => {
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
    await expect(
      MongoTeamAudit.countDocuments({
        teamId: users.owner.teamId,
        event: 'dataset.collection.permission.inheritance_resume'
      })
    ).resolves.toBe(0);
  });
});
