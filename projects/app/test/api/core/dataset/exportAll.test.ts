import handler from '@/pages/api/core/dataset/exportAll';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { StreamCall, Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

// 全局 mock 把 responseWriteController 变成了返回 undefined 的空函数，流式导出需要真实实现。
vi.unmock('@fastgpt/service/common/response');

type TestUser = { teamId: string; tmbId: string };

const createDataset = async ({
  name,
  owner,
  type = DatasetTypeEnum.dataset,
  parentId,
  collectionPermissionEnabled
}: {
  name: string;
  owner: TestUser;
  type?: DatasetTypeEnum;
  parentId?: string;
  collectionPermissionEnabled?: boolean;
}) =>
  MongoDataset.create({
    name,
    type,
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    parentId,
    collectionPermissionEnabled,
    vectorModel: 'test',
    agentModel: 'test'
  });

const createFileCollection = async ({
  name,
  owner,
  datasetId
}: {
  name: string;
  owner: TestUser;
  datasetId: string;
}) => {
  const collection = await MongoDatasetCollection.create({
    name,
    type: DatasetCollectionTypeEnum.file,
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    datasetId
  });
  // 启用态下每个 collection 都有 owner 行，保持与线上物化结果一致。
  await MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.collection,
    teamId: owner.teamId,
    resourceId: String(collection._id),
    tmbId: owner.tmbId,
    permission: OwnerRoleVal
  });
  await MongoDatasetData.create({
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    datasetId,
    collectionId: collection._id,
    q: `${name}-q`,
    a: `${name}-a`
  });
  return collection;
};

const grantDataset = async ({
  datasetId,
  user,
  permission
}: {
  datasetId: string;
  user: TestUser;
  permission: number;
}) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.dataset,
    teamId: user.teamId,
    resourceId: datasetId,
    tmbId: user.tmbId,
    permission
  });

const grantCollection = async ({
  collectionId,
  user,
  permission = ReadRoleVal
}: {
  collectionId: string;
  user: TestUser;
  permission?: number;
}) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.collection,
    teamId: user.teamId,
    resourceId: collectionId,
    tmbId: user.tmbId,
    permission
  });

describe('export dataset respects collection permission', () => {
  it('exports only collections readable by the collaborator', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const member = users.members[0];
    const dataset = await createDataset({
      name: 'enabled-dataset',
      owner,
      collectionPermissionEnabled: true
    });
    const allowed = await createFileCollection({
      name: 'allowed',
      owner,
      datasetId: String(dataset._id)
    });
    const restricted = await createFileCollection({
      name: 'restricted',
      owner,
      datasetId: String(dataset._id)
    });
    await grantDataset({ datasetId: String(dataset._id), user: member, permission: WriteRoleVal });
    await grantCollection({ collectionId: String(allowed._id), user: member });

    const res = await StreamCall(handler, {
      auth: member,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(res.raw).toContain('allowed-q');
    expect(res.raw).not.toContain('restricted-q');
    expect(res.raw).not.toContain('restricted-a');
    void restricted;
  });

  it('exports headers only when the collaborator can read no collection', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const member = users.members[0];
    const dataset = await createDataset({
      name: 'enabled-dataset-no-readable',
      owner,
      collectionPermissionEnabled: true
    });
    await createFileCollection({ name: 'hidden', owner, datasetId: String(dataset._id) });
    await grantDataset({ datasetId: String(dataset._id), user: member, permission: WriteRoleVal });

    const res = await StreamCall(handler, {
      auth: member,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(res.raw).not.toContain('hidden-q');
  });

  it('keeps exporting everything when collection permission is disabled', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const member = users.members[0];
    const dataset = await createDataset({ name: 'closed-dataset', owner });
    await createFileCollection({ name: 'open-file', owner, datasetId: String(dataset._id) });
    await grantDataset({ datasetId: String(dataset._id), user: member, permission: WriteRoleVal });

    const res = await StreamCall(handler, {
      auth: member,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(res.raw).toContain('open-file-q');
  });

  it('does not filter for the team owner', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const dataset = await createDataset({
      name: 'owner-dataset',
      owner,
      collectionPermissionEnabled: true
    });
    await createFileCollection({ name: 'owner-file', owner, datasetId: String(dataset._id) });

    const res = await StreamCall(handler, {
      auth: owner,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(res.raw).toContain('owner-file-q');
  });

  it('rejects exporting a folder', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const folder = await createDataset({
      name: 'export-folder',
      owner,
      type: DatasetTypeEnum.folder
    });
    const child = await createDataset({
      name: 'folder-child',
      owner,
      parentId: String(folder._id)
    });
    await createFileCollection({
      name: 'folder-child-file',
      owner,
      datasetId: String(child._id)
    });

    const res = await Call(handler, {
      auth: owner,
      query: { datasetId: String(folder._id) }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe(DatasetErrEnum.exportFolderNotSupported);
  });
});
