import deleteHandler from '@/pages/api/core/dataset/collection/delete';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { s3FileDeleteMQService } from '@fastgpt/dal/redis/bullmq/services/s3FileDelete';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';

/**
 * 建立 dataset 与一个 file collection：dataset owner 与 collection owner 分离，用于验证删除门槛。
 * collectionPermissionEnabled 仅在启用态用例中为 true（启用态权限只读 collection 自身 ACL 快照）。
 */
const createDatasetWithCollection = async ({
  teamId,
  datasetTmbId,
  collectionTmbId,
  collectionPermissionEnabled = false
}: {
  teamId: string;
  datasetTmbId: string;
  collectionTmbId: string;
  collectionPermissionEnabled?: boolean;
}) => {
  const dataset = await MongoDataset.create({
    name: 'delete-permission',
    teamId,
    tmbId: datasetTmbId,
    vectorModel: 'test',
    agentModel: 'test',
    collectionPermissionEnabled
  });
  const collection = await MongoDatasetCollection.create({
    name: 'file',
    type: DatasetCollectionTypeEnum.file,
    teamId,
    tmbId: collectionTmbId,
    datasetId: dataset._id
  });

  return { dataset, collection };
};

describe('delete collection permission', () => {
  beforeEach(() => {
    vi.spyOn(s3FileDeleteMQService, 'addJob').mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('only deletes S3 files whose key belongs to the collection dataset', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset, collection } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: member.tmbId,
      collectionTmbId: member.tmbId
    });
    // 脏数据：collection.fileId 指向另一个 dataset 的 key
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { fileId: 'dataset/507f1f77bcf86cd799439099/foreign.pdf' } }
    );

    const response = await Call(deleteHandler, {
      auth: member,
      body: { collectionIds: [String(collection._id)] }
    });

    expect(response.code, JSON.stringify(response)).toBe(200);
    // 外库 key 不进入删除名单，避免跨库物理删除
    expect(s3FileDeleteMQService.addJob).not.toHaveBeenCalled();
    expect(String(dataset._id)).toBeTruthy();
  });

  it.each([false, true])(
    'keeps source-file deletion separate from another collection image (managed: %s)',
    async (managed) => {
      const users = await getFakeUsers(1);
      const member = users.members[0];
      const { dataset, collection } = await createDatasetWithCollection({
        teamId: users.owner.teamId,
        datasetTmbId: member.tmbId,
        collectionTmbId: member.tmbId
      });
      const ownFileId = managed
        ? `dataset/${dataset._id}/chunk-images/${'1'.repeat(24)}/file/${'a'.repeat(32)}.png`
        : `dataset/${dataset._id}/own.pdf`;
      await MongoDatasetCollection.updateOne(
        { _id: collection._id },
        { $set: { fileId: ownFileId } }
      );

      const response = await Call(deleteHandler, {
        auth: member,
        body: { collectionIds: [String(collection._id)] }
      });

      expect(response.code, JSON.stringify(response)).toBe(200);
      if (managed) expect(s3FileDeleteMQService.addJob).not.toHaveBeenCalled();
      else
        expect(s3FileDeleteMQService.addJob).toHaveBeenCalledWith({
          bucketName: S3Buckets.private,
          keys: [ownFileId]
        });
    }
  );

  it('deletes S3 images owned by the image collection and excludes foreign images', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: member.tmbId,
      collectionTmbId: member.tmbId
    });
    const imgCollection = await MongoDatasetCollection.create({
      name: 'images-collection',
      type: DatasetCollectionTypeEnum.images,
      teamId: users.owner.teamId,
      tmbId: member.tmbId,
      datasetId: dataset._id
    });

    const ownImageId = `dataset/${dataset._id}/valid-image.png`;
    const foreignImageId = 'dataset/507f1f77bcf86cd799439099/foreign-image.png';

    await MongoDatasetData.create([
      {
        teamId: users.owner.teamId,
        datasetId: dataset._id,
        collectionId: imgCollection._id,
        q: 'own',
        imageId: ownImageId,
        chunkIndex: 0,
        indexes: [],
        tmbId: member.tmbId
      },
      {
        teamId: users.owner.teamId,
        datasetId: dataset._id,
        collectionId: imgCollection._id,
        q: 'foreign',
        imageId: foreignImageId,
        chunkIndex: 1,
        indexes: [],
        tmbId: member.tmbId
      }
    ]);

    const response = await Call(deleteHandler, {
      auth: member,
      body: { collectionIds: [String(imgCollection._id)] }
    });

    expect(response.code, JSON.stringify(response)).toBe(200);
    // 仅删除自有 dataset 的 imageId，排除外库 key
    expect(s3FileDeleteMQService.addJob).toHaveBeenCalledWith({
      bucketName: S3Buckets.private,
      keys: [ownImageId]
    });
  });

  it('deletes the collection when the caller is the collection owner (permission enabled)', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset, collection } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: member.tmbId,
      collectionTmbId: member.tmbId,
      collectionPermissionEnabled: true
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.collection,
      teamId: users.owner.teamId,
      resourceId: String(collection._id),
      tmbId: member.tmbId,
      permission: OwnerRoleVal
    });

    const response = await Call(deleteHandler, {
      auth: member,
      body: { collectionIds: [String(collection._id)] }
    });

    expect(response.code, JSON.stringify(response)).toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toBeNull();
    // 删除只作用于集合同身，dataset 保留
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.not.toBeNull();
  });

  it('deletes the collection when the caller is the collection owner (permission disabled)', async () => {
    const users = await getFakeUsers(2);
    const datasetOwner = users.members[0];
    const collectionOwner = users.members[1];
    const { collection } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: datasetOwner.tmbId,
      collectionTmbId: collectionOwner.tmbId
    });
    // 关闭态无 collection ACL 行：owner 由 collection.tmbId 命中产生，仅需 dataset read 门槛
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: users.owner.teamId,
      resourceId: String(collection.datasetId),
      tmbId: collectionOwner.tmbId,
      permission: ReadRoleVal
    });

    const response = await Call(deleteHandler, {
      auth: collectionOwner,
      body: { collectionIds: [String(collection._id)] }
    });

    expect(response.code, JSON.stringify(response)).toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toBeNull();
  });

  it('rejects a manage collaborator even though manage implies write', async () => {
    const users = await getFakeUsers(2);
    const collectionOwner = users.members[0];
    const collaborator = users.members[1];
    const { collection } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: collectionOwner.tmbId,
      collectionTmbId: collectionOwner.tmbId,
      collectionPermissionEnabled: true
    });
    await MongoResourcePermission.create([
      // 协作者必须先通过 dataset read 门槛，才能进入 collection 级权限校验
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: users.owner.teamId,
        resourceId: String(collection.datasetId),
        tmbId: collaborator.tmbId,
        permission: ReadRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: users.owner.teamId,
        resourceId: String(collection._id),
        tmbId: collaborator.tmbId,
        permission: ManageRoleVal
      }
    ]);

    const response = await Call(deleteHandler, {
      auth: collaborator,
      body: { collectionIds: [String(collection._id)] }
    });

    expect(response.code).not.toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.not.toBeNull();
  });

  it('rejects the dataset owner when the collection belongs to another member', async () => {
    const users = await getFakeUsers(2);
    const datasetOwner = users.members[0];
    const collectionOwner = users.members[1];
    const { collection } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: datasetOwner.tmbId,
      collectionTmbId: collectionOwner.tmbId
    });

    const response = await Call(deleteHandler, {
      auth: datasetOwner,
      body: { collectionIds: [String(collection._id)] }
    });

    // 关闭态 dataset owner 的 role 被 cap 为 manage，不得透传为 collection owner
    expect(response.code).not.toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.not.toBeNull();
  });
});
