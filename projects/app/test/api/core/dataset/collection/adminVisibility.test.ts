import listHandler from '@/pages/api/core/dataset/collection/listV2';
import detailHandler from '@/pages/api/core/dataset/collection/detail';
import deleteHandler from '@/pages/api/core/dataset/collection/delete';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  ManageRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

// 删除成功路径会调用 deleteDatasetFilesByKeys，补齐该 mock 才能覆盖删除成功分支。
vi.mock('@fastgpt/service/common/s3/sources/dataset/index', () => ({
  getS3DatasetSource: vi.fn(() => ({
    deleteDatasetFilesByKeys: vi.fn().mockResolvedValue(undefined)
  })),
  S3DatasetSource: vi.fn()
}));

/** 建知识库（可按需开启 collection 权限开关）+ 一个由团队 owner 创建的 file collection（不写 collection ACL）。 */
const initCase = async ({
  collectionPermissionEnabled
}: { collectionPermissionEnabled?: boolean } = {}) => {
  const users = await getFakeUsers(1);
  const dataset = await MongoDataset.create({
    name: 'admin-collection-visibility',
    teamId: users.owner.teamId,
    tmbId: users.owner.tmbId,
    vectorModel: 'test',
    agentModel: 'test',
    ...(collectionPermissionEnabled ? { collectionPermissionEnabled: true } : {})
  });
  const collection = await MongoDatasetCollection.create({
    name: 'target-file',
    type: DatasetCollectionTypeEnum.file,
    teamId: users.owner.teamId,
    tmbId: users.owner.tmbId,
    datasetId: dataset._id
  });
  return { users, dataset, collection };
};

/** 授予成员 dataset read（知识库门槛）。 */
const grantDatasetRead = ({
  teamId,
  tmbId,
  datasetId
}: {
  teamId: string;
  tmbId: string;
  datasetId: unknown;
}) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.dataset,
    teamId,
    resourceId: String(datasetId),
    tmbId,
    permission: ReadRoleVal
  });

/** 直写一条 collection ACL 行。 */
const grantCollectionRole = ({
  teamId,
  collectionId,
  tmbId,
  permission
}: {
  teamId: string;
  collectionId: unknown;
  tmbId: string;
  permission: number;
}) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.collection,
    teamId,
    resourceId: String(collectionId),
    tmbId,
    permission
  });

const listCollections = ({ auth, datasetId }: { auth: unknown; datasetId: unknown }) =>
  Call(listHandler, {
    auth,
    body: { datasetId: String(datasetId), pageSize: 10, offset: 0, tagFilters: [] }
  });

const getCollectionDetail = ({ auth, collectionId }: { auth: unknown; collectionId: unknown }) =>
  Call(detailHandler, { auth, query: { id: String(collectionId) } });

const deleteCollection = ({ auth, collectionId }: { auth: unknown; collectionId: unknown }) =>
  Call(deleteHandler, { auth, query: { id: String(collectionId) } });

describe('collection visibility for a team admin', () => {
  it('hides a collection the team admin has no permission on while collection permission is enabled', async () => {
    const { users, dataset, collection } = await initCase({ collectionPermissionEnabled: true });
    await grantDatasetRead({
      teamId: users.owner.teamId,
      datasetId: dataset._id,
      tmbId: users.manager.tmbId
    });

    const listRes = await listCollections({ auth: users.manager, datasetId: dataset._id });
    expect(listRes.code).toBe(200);
    expect(listRes.data.list).toEqual([]);
    expect(listRes.data.total).toBe(0);

    const detailRes = await getCollectionDetail({
      auth: users.manager,
      collectionId: collection._id
    });
    expect(detailRes.error).toBe(DatasetErrEnum.unAuthDatasetCollection);

    const deleteRes = await deleteCollection({
      auth: users.manager,
      collectionId: collection._id
    });
    expect(deleteRes.error).toBe(DatasetErrEnum.unAuthDatasetCollection);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.not.toBeNull();
  });

  it('hides a collection from the team admin when the dataset switch is disabled and the admin has no dataset role', async () => {
    const { users, dataset, collection } = await initCase();

    const listRes = await listCollections({ auth: users.manager, datasetId: dataset._id });
    expect(listRes.error).toBe(DatasetErrEnum.unAuthDataset);

    const detailRes = await getCollectionDetail({
      auth: users.manager,
      collectionId: collection._id
    });
    expect(detailRes.error).toBe(DatasetErrEnum.unAuthDataset);
  });

  it('lets the team admin act on a collection after an explicit collection role is granted', async () => {
    const { users, dataset, collection } = await initCase({ collectionPermissionEnabled: true });
    await grantDatasetRead({
      teamId: users.owner.teamId,
      datasetId: dataset._id,
      tmbId: users.manager.tmbId
    });
    await grantCollectionRole({
      teamId: users.owner.teamId,
      collectionId: collection._id,
      tmbId: users.manager.tmbId,
      permission: ManageRoleVal
    });

    const listRes = await listCollections({ auth: users.manager, datasetId: dataset._id });
    expect(listRes.code).toBe(200);
    expect(listRes.data.total).toBe(1);
    expect(listRes.data.list).toHaveLength(1);
    expect(listRes.data.list[0]._id).toBe(String(collection._id));
    expect(listRes.data.list[0].permission).toMatchObject({
      role: ManageRoleVal,
      isOwner: false,
      hasManagePer: true
    });

    const detailRes = await getCollectionDetail({
      auth: users.manager,
      collectionId: collection._id
    });
    expect(detailRes.code).toBe(200);

    const deleteRes = await deleteCollection({
      auth: users.manager,
      collectionId: collection._id
    });
    expect(deleteRes.code).toBe(200);
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toBeNull();
  });

  it('keeps the team owner bypass while collection permission is enabled', async () => {
    const { users, dataset, collection } = await initCase({ collectionPermissionEnabled: true });

    const listRes = await listCollections({ auth: users.owner, datasetId: dataset._id });
    expect(listRes.code).toBe(200);
    expect(listRes.data.total).toBe(1);
    expect(listRes.data.list[0]._id).toBe(String(collection._id));
    expect(listRes.data.list[0].permission).toMatchObject({
      isOwner: true,
      hasManagePer: true
    });
  });

  it('leaves an ordinary member unchanged', async () => {
    const { users, dataset, collection } = await initCase({ collectionPermissionEnabled: true });
    const member = users.members[0];
    await grantDatasetRead({
      teamId: users.owner.teamId,
      datasetId: dataset._id,
      tmbId: member.tmbId
    });

    const hiddenRes = await listCollections({ auth: member, datasetId: dataset._id });
    expect(hiddenRes.data.list).toEqual([]);
    expect(hiddenRes.data.total).toBe(0);

    await grantCollectionRole({
      teamId: users.owner.teamId,
      collectionId: collection._id,
      tmbId: member.tmbId,
      permission: ReadRoleVal
    });

    const visibleRes = await listCollections({ auth: member, datasetId: dataset._id });
    expect(visibleRes.data.total).toBe(1);
    expect(visibleRes.data.list[0].permission).toMatchObject({
      role: ReadRoleVal,
      isOwner: false,
      hasReadPer: true,
      hasManagePer: false
    });
  });
});
