import deleteHandler from '@/pages/api/core/dataset/collection/delete';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  ManageRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

// delCollection 会调用 deleteDatasetFilesByKeys，补齐该 mock 才能覆盖删除成功路径。
vi.mock('@fastgpt/service/common/s3/sources/dataset/index', () => ({
  getS3DatasetSource: vi.fn(() => ({
    deleteDatasetFilesByKeys: vi.fn().mockResolvedValue(undefined)
  })),
  S3DatasetSource: vi.fn()
}));

/** 建一个知识库 + 一个文件 collection，并给指定成员授予知识库权限。 */
const initDatasetCase = async ({
  collectionPermissionEnabled = false,
  memberRole
}: {
  collectionPermissionEnabled?: boolean;
  memberRole?: number;
}) => {
  const users = await getFakeUsers(1);
  const member = users.members[0];
  const dataset = await MongoDataset.create({
    name: 'delete-collection-dataset',
    type: DatasetTypeEnum.dataset,
    teamId: users.owner.teamId,
    tmbId: users.owner.tmbId,
    collectionPermissionEnabled
  });
  const collection = await MongoDatasetCollection.create({
    name: 'delete-collection-target',
    type: DatasetCollectionTypeEnum.file,
    teamId: users.owner.teamId,
    tmbId: users.owner.tmbId,
    datasetId: dataset._id
  });
  if (memberRole !== undefined) {
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: users.owner.teamId,
      resourceId: String(dataset._id),
      tmbId: member.tmbId,
      permission: memberRole
    });
  }

  return { users, member, dataset, collection };
};

describe('dataset collection delete permission', () => {
  it('allows the dataset owner to delete a collection', async () => {
    const { users, collection } = await initDatasetCase({});

    const res = await Call(deleteHandler, {
      auth: users.owner,
      query: { id: String(collection._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toBeNull();
  });

  it('allows a dataset manage collaborator to delete a collection', async () => {
    const { member, collection } = await initDatasetCase({ memberRole: ManageRoleVal });

    const res = await Call(deleteHandler, {
      auth: member,
      query: { id: String(collection._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toBeNull();
  });

  it('rejects a dataset write collaborator', async () => {
    const { member, collection } = await initDatasetCase({ memberRole: WriteRoleVal });

    const res = await Call(deleteHandler, {
      auth: member,
      query: { id: String(collection._id) }
    });

    expect(res.error).toBe(DatasetErrEnum.unAuthDatasetCollection);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.not.toBeNull();
  });

  it('rejects a collection write collaborator when collection permission is enabled', async () => {
    const { users, member, collection } = await initDatasetCase({
      collectionPermissionEnabled: true,
      memberRole: ReadRoleVal
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.collection,
      teamId: users.owner.teamId,
      resourceId: String(collection._id),
      tmbId: member.tmbId,
      permission: WriteRoleVal
    });

    const res = await Call(deleteHandler, {
      auth: member,
      query: { id: String(collection._id) }
    });

    expect(res.error).toBe(DatasetErrEnum.unAuthDatasetCollection);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.not.toBeNull();
  });

  it('rejects the whole batch when any collection lacks manage permission', async () => {
    const { member, dataset, collection } = await initDatasetCase({ memberRole: WriteRoleVal });
    const sibling = await MongoDatasetCollection.create({
      name: 'delete-collection-sibling',
      type: DatasetCollectionTypeEnum.file,
      teamId: dataset.teamId,
      tmbId: dataset.tmbId,
      datasetId: dataset._id
    });

    const res = await Call(deleteHandler, {
      auth: member,
      body: { collectionIds: [String(collection._id), String(sibling._id)] }
    });

    expect(res.error).toBe(DatasetErrEnum.unAuthDatasetCollection);
    await expect(
      MongoDatasetCollection.countDocuments({
        _id: { $in: [collection._id, sibling._id] }
      })
    ).resolves.toBe(2);
  });
});
