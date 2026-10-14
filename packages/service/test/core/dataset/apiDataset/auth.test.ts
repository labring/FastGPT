import { describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  authApiFileImportChanges,
  type ApiFileImportChanges
} from '@fastgpt/service/core/dataset/apiDataset/auth';
import { getFakeUsers } from '@test/datas/users';

/** 使用真实资源和 ACL，仅身份解析复用全局测试替身，避免入口权限测试被整体 mock 掉。 */
const fixture = async () => {
  const users = await getFakeUsers(1);
  const actor = users.members[0];
  const teamId = String(users.owner.teamId);
  const dataset = await MongoDataset.create({
    teamId,
    tmbId: users.owner.tmbId,
    name: 'dataset',
    type: DatasetTypeEnum.dataset,
    collectionPermissionEnabled: true
  });
  const datasetId = String(dataset._id);
  const acl = async (
    resourceId: string,
    permission: number,
    resourceType = PerResourceTypeEnum.collection
  ) =>
    mongoSessionRun((session) =>
      resourcePermissionRepo.replaceResource({
        teamId,
        resourceType,
        resourceId,
        session,
        collaborators: [
          { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
          ...(permission ? [{ tmbId: String(actor.tmbId), permission }] : [])
        ]
      })
    );
  await acl(datasetId, WriteRoleVal, PerResourceTypeEnum.dataset);
  const source = await MongoDatasetCollection.create({
    teamId,
    datasetId,
    tmbId: users.owner.tmbId,
    name: 'restricted',
    type: DatasetCollectionTypeEnum.folder,
    inheritPermission: false
  });
  const target = await MongoDatasetCollection.create({
    teamId,
    datasetId,
    tmbId: users.owner.tmbId,
    name: 'target',
    type: DatasetCollectionTypeEnum.folder
  });
  const file = await MongoDatasetCollection.create({
    teamId,
    datasetId,
    tmbId: users.owner.tmbId,
    name: 'file',
    type: DatasetCollectionTypeEnum.apiFile,
    parentId: source._id
  });
  await acl(String(source._id), 0);
  await acl(String(target._id), ManageRoleVal);
  await acl(String(file._id), ReadRoleVal);
  const move = {
    _id: String(file._id),
    type: file.type,
    oldParentId: String(source._id),
    newParentId: String(target._id),
    apiFileParentId: 'target'
  };
  const call = (changes: Partial<ApiFileImportChanges>, identity = actor) =>
    authApiFileImportChanges({
      req: { auth: identity } as any,
      authToken: true,
      authApiKey: true,
      datasetId,
      creationParentIds: [],
      newFolderIds: new Set(),
      moves: [],
      ...changes
    });
  return { call, acl, source, target, file, move, teamId, datasetId, owner: users.owner };
};

describe('authApiFileImportChanges', () => {
  it('知识库 write 不能绕过实际已有父目录的创建权限', async () => {
    const { call, source } = await fixture();
    await expect(call({ creationParentIds: [String(source._id)] })).rejects.toBe(
      DatasetErrEnum.unAuthDatasetCollection
    );
  });
  it('重复导入不能绕过源目录 manage，即使目标目录可管理', async () => {
    const { call, move } = await fixture();
    await expect(call({ moves: [move] })).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
  });
  it('目标目录只有 write 时仍不能接收已有节点移动', async () => {
    const { call, move, acl, source, target } = await fixture();
    await acl(String(source._id), ManageRoleVal);
    await acl(String(target._id), WriteRoleVal);
    await expect(call({ moves: [move] })).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
  });
  it('源、目标都满足管理权限时允许完整计划，重复父级授权幂等', async () => {
    const { call, move, acl, source, target } = await fixture();
    await acl(String(source._id), ManageRoleVal);
    await expect(
      call({ creationParentIds: [String(target._id), String(target._id)], moves: [move, move] })
    ).resolves.toBeUndefined();
  });
  it('本轮新目录归调用者所有，但仍要求源目录 manage', async () => {
    const { call, move, acl, source, target } = await fixture();
    const plannedId = String(new Types.ObjectId());
    await acl(String(source._id), ManageRoleVal);
    await expect(
      call({
        creationParentIds: [String(target._id)],
        newFolderIds: new Set([plannedId]),
        moves: [{ ...move, newParentId: plannedId }]
      })
    ).resolves.toBeUndefined();
  });
  it('兼容权限来源要求 manage，只有 write 时拒绝，即使没有父级移动', async () => {
    const { call, file, acl } = await fixture();
    await acl(String(file._id), WriteRoleVal);
    await expect(call({ permissionSourceIds: [String(file._id)] })).rejects.toBe(
      DatasetErrEnum.unAuthDatasetCollection
    );
    await acl(String(file._id), ManageRoleVal);
    await expect(call({ permissionSourceIds: [String(file._id)] })).resolves.toBeUndefined();
  });
  it('仅更新远端父字段仍要求节点 write', async () => {
    const { call, move } = await fixture();
    await expect(call({ moves: [{ ...move, newParentId: move.oldParentId }] })).rejects.toBe(
      DatasetErrEnum.unAuthDatasetCollection
    );
  });
  it('知识库 write 可在根目录创建', async () => {
    const { call } = await fixture();
    await expect(call({ creationParentIds: [null] })).resolves.toBeUndefined();
  });

  it('节点 write 允许仅清理远端父字段', async () => {
    const { call, acl, file, move } = await fixture();
    await acl(String(file._id), WriteRoleVal);
    await expect(
      call({ moves: [{ ...move, newParentId: move.oldParentId }] })
    ).resolves.toBeUndefined();
  });

  it('团队 owner 可移动根级节点，仍复用普通移动的根权限校验', async () => {
    const { call, owner, move } = await fixture();
    await expect(call({ moves: [{ ...move, oldParentId: null }] }, owner)).resolves.toBeUndefined();
  });

  it('即使目标目录可写，也拒绝跨知识库落位', async () => {
    const { call, acl, teamId, owner } = await fixture();
    const foreign = await MongoDataset.create({
      teamId,
      tmbId: owner.tmbId,
      name: 'foreign',
      type: DatasetTypeEnum.dataset,
      collectionPermissionEnabled: true
    });
    await acl(String(foreign._id), WriteRoleVal, PerResourceTypeEnum.dataset);
    const folder = await MongoDatasetCollection.create({
      teamId,
      datasetId: foreign._id,
      tmbId: owner.tmbId,
      type: DatasetCollectionTypeEnum.folder,
      name: 'foreign-folder'
    });
    await acl(String(folder._id), WriteRoleVal);
    await expect(call({ creationParentIds: [String(folder._id)] })).rejects.toBe(
      DatasetErrEnum.unAuthDatasetCollection
    );
  });

  it('移到根目录仍要求团队创建知识库权限', async () => {
    const { call, move, acl, source } = await fixture();
    await acl(String(source._id), ManageRoleVal);
    await expect(call({ moves: [{ ...move, newParentId: null }] })).rejects.toBeDefined();
  });
});
