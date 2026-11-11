import deleteHandler from '@/pages/api/core/dataset/collection/delete';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { buildApiFileRecords, toApiFileDirId } from '@fastgpt/service/core/dataset/apiDataset/tree';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// delCollection 会调用 deleteDatasetFilesByKeys，而全局 s3 mock 未提供该方法；本地补齐。
const { mockDeleteDatasetFilesByKeys } = vi.hoisted(() => ({
  mockDeleteDatasetFilesByKeys: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    createGetDatasetFileURL: vi.fn(),
    createUploadDatasetFileURL: vi.fn(),
    deleteDatasetFile: vi.fn(),
    deleteDatasetFilesByKeys: mockDeleteDatasetFilesByKeys
  })
}));

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
    mockDeleteDatasetFilesByKeys.mockReset();
    mockDeleteDatasetFilesByKeys.mockResolvedValue(undefined);
  });

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

    expect(response.code).toBe(200);
    // 外库 key 不进入删除名单，避免跨库物理删除
    expect(mockDeleteDatasetFilesByKeys).toHaveBeenCalledWith([]);
    expect(String(dataset._id)).toBeTruthy();
  });

  it('deletes S3 files owned by the collection dataset', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset, collection } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: member.tmbId,
      collectionTmbId: member.tmbId
    });
    const ownFileId = `dataset/${dataset._id}/own.pdf`;
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { fileId: ownFileId } }
    );

    const response = await Call(deleteHandler, {
      auth: member,
      body: { collectionIds: [String(collection._id)] }
    });

    expect(response.code).toBe(200);
    expect(mockDeleteDatasetFilesByKeys).toHaveBeenCalledWith([ownFileId]);
  });

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

    expect(response.code).toBe(200);
    // 仅删除自有 dataset 的 imageId，排除外库 key
    expect(mockDeleteDatasetFilesByKeys).toHaveBeenCalledWith([ownImageId]);
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

    expect(response.code).toBe(200);
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

    expect(response.code).toBe(200);
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

describe('delete collection by apiFileId', () => {
  beforeEach(() => {
    mockDeleteDatasetFilesByKeys.mockReset();
    mockDeleteDatasetFilesByKeys.mockResolvedValue(undefined);
  });

  const fixture = async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset, collection } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: member.tmbId,
      collectionTmbId: member.tmbId
    });
    const createCollection = (data: Record<string, any>) =>
      MongoDatasetCollection.create({
        teamId: users.owner.teamId,
        tmbId: member.tmbId,
        datasetId: dataset._id,
        ...data
      });
    return { member, dataset, collection, createCollection };
  };

  /**
   * 按真实导入布局写入集合：带子文档的文件产出「派生目录 + 正文」两条记录，
   * 子文档挂在目录下，目录带 apiFileSourceId 来源标记（与 createApiFileFolders 一致）。
   */
  const insertApiFileLayout = async ({
    teamId,
    tmbId,
    bodyTmbId,
    datasetId,
    fileId,
    childId,
    skipApiFileIds = []
  }: {
    teamId: string;
    tmbId: string;
    /** 正文单独转给其他成员，用于验证目录 owner 仍可按外部 ID 清理整棵树。 */
    bodyTmbId?: string;
    datasetId: string;
    fileId: string;
    childId: string;
    skipApiFileIds?: string[];
  }) => {
    const records = buildApiFileRecords([
      {
        serverId: fileId,
        serverParentId: null,
        dirId: toApiFileDirId(fileId, 'file'),
        type: 'file',
        name: fileId,
        depth: 0,
        hasChild: true
      },
      {
        serverId: childId,
        serverParentId: fileId,
        dirId: toApiFileDirId(childId, 'file'),
        type: 'file',
        name: childId,
        depth: 1,
        hasChild: false
      }
    ]);
    const idByApiFileId = new Map<string, string>();
    for (const record of records) {
      if (skipApiFileIds.includes(record.apiFileId)) continue;
      const created = await MongoDatasetCollection.create({
        name: record.name,
        type:
          record.type === 'folder'
            ? DatasetCollectionTypeEnum.folder
            : DatasetCollectionTypeEnum.apiFile,
        teamId,
        tmbId: record.type === 'folder' ? tmbId : (bodyTmbId ?? tmbId),
        datasetId,
        apiFileId: record.apiFileId,
        apiFileParentId: record.apiFileParentId ?? undefined,
        parentId: record.parentDirId ? idByApiFileId.get(record.parentDirId)! : null,
        ...(record.type === 'folder' ? { metadata: { apiFileSourceId: record.sourceId } } : {})
      });
      idByApiFileId.set(record.apiFileId, String(created._id));
    }
    return { records, idByApiFileId };
  };

  it('deletes the matched node and its subtree, keeping unrelated collections', async () => {
    const { member, dataset, createCollection } = await fixture();
    const folder = await createCollection({
      name: 'api-folder',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'api-folder-1'
    });
    const child = await createCollection({
      name: 'api-child',
      type: DatasetCollectionTypeEnum.apiFile,
      parentId: folder._id,
      apiFileId: 'api-child-1'
    });
    const untouched = await createCollection({
      name: 'kept',
      type: DatasetCollectionTypeEnum.folder
    });

    const response = await Call(deleteHandler, {
      auth: member,
      body: { datasetId: String(dataset._id), apiFileIds: ['api-folder-1'] }
    });

    expect(response.code).toBe(200);
    await expect(MongoDatasetCollection.findById(folder._id).lean()).resolves.toBeNull();
    await expect(MongoDatasetCollection.findById(child._id).lean()).resolves.toBeNull();
    await expect(MongoDatasetCollection.findById(untouched._id).lean()).resolves.not.toBeNull();
  });

  it('rejects when none of the apiFileIds match', async () => {
    const { member, dataset, collection } = await fixture();

    const response = await Call(deleteHandler, {
      auth: member,
      body: { datasetId: String(dataset._id), apiFileIds: ['missing'] }
    });

    expect(response.code).not.toBe(200);
    expect(response.error).toBe(DatasetErrEnum.unExistCollection);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.not.toBeNull();
  });

  it('only deletes within the given dataset', async () => {
    const { member, dataset, collection } = await fixture();
    const otherDataset = await createDatasetWithCollection({
      teamId: member.teamId,
      datasetTmbId: member.tmbId,
      collectionTmbId: member.tmbId
    });
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { apiFileId: 'shared-file' } }
    );
    await MongoDatasetCollection.updateOne(
      { _id: otherDataset.collection._id },
      { $set: { apiFileId: 'shared-file' } }
    );

    const response = await Call(deleteHandler, {
      auth: member,
      body: { datasetId: String(dataset._id), apiFileIds: ['shared-file'] }
    });

    expect(response.code).toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toBeNull();
    await expect(
      MongoDatasetCollection.findById(otherDataset.collection._id).lean()
    ).resolves.not.toBeNull();
  });

  it('deletes the derived folder and child documents of a file with children', async () => {
    const { member, dataset } = await fixture();
    await insertApiFileLayout({
      teamId: member.teamId,
      tmbId: member.tmbId,
      datasetId: String(dataset._id),
      fileId: 'doc',
      childId: 'child'
    });

    const response = await Call(deleteHandler, {
      auth: member,
      body: { datasetId: String(dataset._id), apiFileIds: ['doc'] }
    });

    expect(response.code).toBe(200);
    const remaining = await MongoDatasetCollection.find({
      datasetId: dataset._id,
      apiFileId: { $in: ['doc', 'doc#dir', 'child'] }
    }).lean();
    expect(remaining).toHaveLength(0);
  });

  it('deletes the derived folder even when the body was never persisted', async () => {
    const { member, dataset } = await fixture();
    const { idByApiFileId } = await insertApiFileLayout({
      teamId: member.teamId,
      tmbId: member.tmbId,
      datasetId: String(dataset._id),
      fileId: 'doc',
      childId: 'child',
      skipApiFileIds: ['doc']
    });
    expect(idByApiFileId.has('doc')).toBe(false);

    const response = await Call(deleteHandler, {
      auth: member,
      body: { datasetId: String(dataset._id), apiFileIds: ['doc'] }
    });

    expect(response.code).toBe(200);
    expect(
      await MongoDatasetCollection.countDocuments({
        datasetId: dataset._id,
        apiFileId: { $in: ['doc#dir', 'child'] }
      })
    ).toBe(0);
  });

  it('deletes the whole tree by apiFileId when the body was transferred to another member', async () => {
    const users = await getFakeUsers(2);
    const dirOwner = users.members[0];
    const bodyOwner = users.members[1];
    const { dataset } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: dirOwner.tmbId,
      collectionTmbId: dirOwner.tmbId
    });
    await insertApiFileLayout({
      teamId: users.owner.teamId,
      tmbId: dirOwner.tmbId,
      bodyTmbId: bodyOwner.tmbId,
      datasetId: String(dataset._id),
      fileId: 'doc',
      childId: 'child'
    });

    const response = await Call(deleteHandler, {
      auth: dirOwner,
      body: { datasetId: String(dataset._id), apiFileIds: ['doc'] }
    });

    expect(response.code).toBe(200);
    expect(
      await MongoDatasetCollection.countDocuments({
        datasetId: dataset._id,
        apiFileId: { $in: ['doc', 'doc#dir', 'child'] }
      })
    ).toBe(0);
  });

  it('rejects a caller who owns only the body but not its directory', async () => {
    const users = await getFakeUsers(2);
    const dirOwner = users.members[0];
    const bodyOwner = users.members[1];
    const { dataset } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: dirOwner.tmbId,
      collectionTmbId: dirOwner.tmbId
    });
    await insertApiFileLayout({
      teamId: users.owner.teamId,
      tmbId: dirOwner.tmbId,
      bodyTmbId: bodyOwner.tmbId,
      datasetId: String(dataset._id),
      fileId: 'doc',
      childId: 'child'
    });
    // 正文 owner 需要 dataset read 才能走到集合级 owner 校验
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: users.owner.teamId,
      resourceId: String(dataset._id),
      tmbId: bodyOwner.tmbId,
      permission: ReadRoleVal
    });

    const response = await Call(deleteHandler, {
      auth: bodyOwner,
      body: { datasetId: String(dataset._id), apiFileIds: ['doc'] }
    });

    expect(response.code).not.toBe(200);
    expect(
      await MongoDatasetCollection.countDocuments({
        datasetId: dataset._id,
        apiFileId: { $in: ['doc', 'doc#dir', 'child'] }
      })
    ).toBe(3);
  });

  it('ignores matched nodes covered by a matched ancestor through inner folders', async () => {
    const users = await getFakeUsers(2);
    const dirOwner = users.members[0];
    const bodyOwner = users.members[1];
    const { dataset } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: dirOwner.tmbId,
      collectionTmbId: dirOwner.tmbId
    });
    const { idByApiFileId } = await insertApiFileLayout({
      teamId: users.owner.teamId,
      tmbId: dirOwner.tmbId,
      bodyTmbId: bodyOwner.tmbId,
      datasetId: String(dataset._id),
      fileId: 'doc',
      childId: 'child'
    });
    // 正文被移入派生目录内的自建文件夹：该文件夹没有外部身份，不在命中集合里
    const innerFolder = await MongoDatasetCollection.create({
      name: 'inner',
      type: DatasetCollectionTypeEnum.folder,
      teamId: users.owner.teamId,
      tmbId: dirOwner.tmbId,
      datasetId: dataset._id,
      parentId: idByApiFileId.get('doc#dir')
    });
    await MongoDatasetCollection.updateOne(
      { _id: idByApiFileId.get('doc') },
      { $set: { parentId: innerFolder._id } }
    );

    const response = await Call(deleteHandler, {
      auth: dirOwner,
      body: { datasetId: String(dataset._id), apiFileIds: ['doc'] }
    });

    expect(response.code).toBe(200);
    expect(
      await MongoDatasetCollection.countDocuments({
        datasetId: dataset._id,
        apiFileId: { $in: ['doc', 'doc#dir', 'child'] }
      })
    ).toBe(0);
    await expect(MongoDatasetCollection.findById(innerFolder._id).lean()).resolves.toBeNull();
  });

  it('still requires owner when the body was moved outside the derived folder', async () => {
    const users = await getFakeUsers(2);
    const dirOwner = users.members[0];
    const bodyOwner = users.members[1];
    const { dataset } = await createDatasetWithCollection({
      teamId: users.owner.teamId,
      datasetTmbId: dirOwner.tmbId,
      collectionTmbId: dirOwner.tmbId
    });
    const { idByApiFileId } = await insertApiFileLayout({
      teamId: users.owner.teamId,
      tmbId: dirOwner.tmbId,
      bodyTmbId: bodyOwner.tmbId,
      datasetId: String(dataset._id),
      fileId: 'doc',
      childId: 'child'
    });
    // 正文移到派生目录之外：不再由命中目录的子树覆盖，必须独立鉴权
    const outsideFolder = await MongoDatasetCollection.create({
      name: 'outside',
      type: DatasetCollectionTypeEnum.folder,
      teamId: users.owner.teamId,
      tmbId: dirOwner.tmbId,
      datasetId: dataset._id
    });
    await MongoDatasetCollection.updateOne(
      { _id: idByApiFileId.get('doc') },
      { $set: { parentId: outsideFolder._id } }
    );

    const response = await Call(deleteHandler, {
      auth: dirOwner,
      body: { datasetId: String(dataset._id), apiFileIds: ['doc'] }
    });

    expect(response.code).not.toBe(200);
    expect(
      await MongoDatasetCollection.countDocuments({
        datasetId: dataset._id,
        apiFileId: { $in: ['doc', 'doc#dir', 'child'] }
      })
    ).toBe(3);
  });

  it('rejects unpaired external ids', async () => {
    const { member, dataset } = await fixture();

    const response = await Call(deleteHandler, {
      auth: member,
      body: { datasetId: String(dataset._id) }
    });

    expect(response.code).not.toBe(200);
    expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
  });

  it('rejects the virtual root apiFileId', async () => {
    const { member, dataset, createCollection } = await fixture();
    const root = await createCollection({
      name: 'api-root',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: RootCollectionId
    });

    const response = await Call(deleteHandler, {
      auth: member,
      body: { datasetId: String(dataset._id), apiFileIds: [RootCollectionId] }
    });

    expect(response.code).not.toBe(200);
    expect(response.error).toBe(CommonErrEnum.invalidParams);
    await expect(MongoDatasetCollection.findById(root._id).lean()).resolves.not.toBeNull();
  });
});
