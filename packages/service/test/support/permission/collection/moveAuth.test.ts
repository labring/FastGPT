import { describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  ManageRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import {
  authDatasetCollectionMove,
  authDatasetCollectionMoves
} from '@fastgpt/service/support/permission/collection/moveAuth';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { getFakeUsers } from '@test/datas/users';
import { Types } from '@fastgpt/service/common/mongo';

/** 真实资源/ACL，只复用全局身份替身；便于比较批量与单条入口的权限语义和实际查询规模。 */
const fixture = async (enabled = true) => {
  const users = await getFakeUsers(1);
  const actor = users.members[0];
  const teamId = String(actor.teamId);
  const dataset = await MongoDataset.create({
    teamId,
    tmbId: users.owner.tmbId,
    name: 'move-auth',
    type: DatasetTypeEnum.dataset,
    collectionPermissionEnabled: enabled
  });
  const datasetId = String(dataset._id);
  const grant = async (
    resourceId: string,
    permission: number,
    resourceType = PerResourceTypeEnum.collection
  ) => {
    await MongoResourcePermission.deleteMany({
      teamId,
      resourceType,
      resourceId,
      tmbId: actor.tmbId
    });
    await MongoResourcePermission.create({
      teamId,
      resourceType,
      resourceId,
      tmbId: actor.tmbId,
      permission
    });
  };
  await grant(datasetId, WriteRoleVal, PerResourceTypeEnum.dataset);
  const source = await MongoDatasetCollection.create({
    teamId,
    datasetId,
    tmbId: users.owner.tmbId,
    name: 'source',
    type: DatasetCollectionTypeEnum.folder
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
  for (const parent of [source, target]) await grant(String(parent._id), ManageRoleVal);
  await grant(String(file._id), ReadRoleVal);
  const auth = { req: { auth: actor } as any, authToken: true, authApiKey: true };
  const move = { collectionId: String(file._id), targetParentId: String(target._id) };
  return { auth, move, actor, owner: users.owner, teamId, datasetId, file, source, target, grant };
};

describe('authDatasetCollectionMoves', () => {
  it('2001 次移动只解析一次身份，父级与 ACL 按唯一 ID 分批，单条返回完整源节点', async () => {
    const { auth, move, teamId, datasetId, source, target, owner, actor } = await fixture();
    const files = await MongoDatasetCollection.insertMany(
      Array.from({ length: 2001 }, (_, i) => ({
        teamId,
        datasetId,
        tmbId: owner.tmbId,
        name: `file-${i}`,
        type: DatasetCollectionTypeEnum.apiFile,
        parentId: source._id
      }))
    );
    await MongoResourcePermission.insertMany(
      files.map((file) => ({
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: String(file._id),
        tmbId: actor.tmbId,
        permission: ReadRoleVal
      }))
    );
    const finds = vi.spyOn(MongoDatasetCollection, 'find');
    const aclReads = vi.spyOn(resourcePermissionRepo, 'findByResourceIdsAndCollaborators');
    vi.mocked(parseHeaderCert).mockClear();
    await authDatasetCollectionMoves({
      ...auth,
      datasetId,
      moves: files.map((file) => ({
        collectionId: String(file._id),
        targetParentId: String(target._id)
      }))
    });
    expect(parseHeaderCert).toHaveBeenCalledTimes(1);
    expect(
      (finds.mock.calls as unknown as [{ _id: { $in: string[] } }][]).map(
        ([query]) => query._id.$in.length
      )
    ).toEqual([1000, 1000, 1, 2]);
    expect(
      aclReads.mock.calls
        .filter(([query]) => query.resourceType === PerResourceTypeEnum.collection)
        .map(([query]) => query.resourceIds.length)
    ).toEqual([1000, 1000, 3]);
    const allAclIds = aclReads.mock.calls
      .filter(([query]) => query.resourceType === PerResourceTypeEnum.collection)
      .flatMap(([query]) => query.resourceIds);
    expect(new Set(allAclIds).size).toBe(allAclIds.length);
    finds.mockRestore();
    aclReads.mockRestore();
    const single = await authDatasetCollectionMove({ ...auth, ...move });
    expect(single.collection.name).toBe('file');
    expect(single.collection.dataset.name).toBe('move-auth');
    expect(single.tmbId).toBe(actor.tmbId);
  });
  it.each(['object', 'uppercase'])('批量和单条鉴权归一 %s ID，并返回完整源记录', async (form) => {
    const { auth, file, target } = await fixture();
    const normalize = (id: unknown) =>
      form === 'object' ? new Types.ObjectId(String(id)) : String(id).toUpperCase();
    const move = { collectionId: normalize(file._id), targetParentId: normalize(target._id) };
    const batch = await authDatasetCollectionMoves({ ...auth, moves: [move] as never });
    expect(batch.collections.get(String(file._id))?.name).toBe('file');
    const single = await authDatasetCollectionMove({ ...auth, ...move } as never);
    expect(String(single.collection._id)).toBe(String(file._id));
    expect(single.collection.dataset.name).toBe('move-auth');
  });
  it.each(['source', 'target'] as const)(
    '父目录 %s 只有 write 时批量和单条都拒绝',
    async (side) => {
      const context = await fixture();
      await context.grant(String(context[side]._id), WriteRoleVal);
      await expect(
        authDatasetCollectionMoves({ ...context.auth, moves: [context.move] })
      ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
      await expect(authDatasetCollectionMove({ ...context.auth, ...context.move })).rejects.toBe(
        DatasetErrEnum.unAuthDatasetCollection
      );
    }
  );
  it('显式移到原父级仍要求 manage，元数据 write 与创建父级 write 可合并', async () => {
    const { auth, move, source, file, datasetId, grant } = await fixture();
    await grant(String(source._id), WriteRoleVal);
    await expect(
      authDatasetCollectionMoves({
        ...auth,
        moves: [{ ...move, targetParentId: String(source._id) }]
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
    await grant(String(file._id), WriteRoleVal);
    await expect(
      authDatasetCollectionMoves({
        ...auth,
        datasetId,
        moves: [],
        creationParentIds: [String(source._id)],
        collectionChecks: [{ collectionId: String(file._id), per: WriteRoleVal }]
      })
    ).resolves.toBeDefined();
  });
  it('Collection owner 仍受知识库 read 门槛约束', async () => {
    const { auth, move, file, actor, datasetId, grant } = await fixture();
    await MongoDatasetCollection.updateOne({ _id: file._id }, { tmbId: actor.tmbId });
    await grant(datasetId, 0, PerResourceTypeEnum.dataset);
    await expect(authDatasetCollectionMoves({ ...auth, moves: [move] })).rejects.toBe(
      DatasetErrEnum.unAuthDataset
    );
  });
  it('知识库继承父目录 ACL，关闭集合权限时沿用知识库 role，owner 正确降级', async () => {
    const { auth, move, datasetId, actor, teamId, owner, grant } = await fixture(false);
    const parent = await MongoDataset.create({
      teamId,
      tmbId: owner.tmbId,
      type: DatasetTypeEnum.folder,
      name: 'parent'
    });
    await MongoDataset.updateOne(
      { _id: datasetId },
      { parentId: parent._id, inheritPermission: true }
    );
    await grant(datasetId, 0, PerResourceTypeEnum.dataset);
    await grant(String(parent._id), ManageRoleVal, PerResourceTypeEnum.dataset);
    await expect(authDatasetCollectionMoves({ ...auth, moves: [move] })).resolves.toBeDefined();
    await MongoDataset.updateOne({ _id: datasetId }, { tmbId: actor.tmbId });
    await expect(authDatasetCollectionMoves({ ...auth, moves: [move] })).resolves.toBeDefined();
  });
  it('关闭态仍允许集合 owner 写入，其余成员只有 read 无法移动', async () => {
    const { auth, move, datasetId, actor, file, grant } = await fixture(false);
    await grant(datasetId, ReadRoleVal, PerResourceTypeEnum.dataset);
    await MongoDatasetCollection.updateOne({ _id: file._id }, { tmbId: actor.tmbId });
    await expect(
      authDatasetCollectionMoves({
        ...auth,
        datasetId,
        moves: [],
        collectionChecks: [{ collectionId: String(file._id), per: WriteRoleVal }]
      })
    ).resolves.toBeDefined();
    await expect(authDatasetCollectionMoves({ ...auth, moves: [move] })).rejects.toBe(
      DatasetErrEnum.unAuthDatasetCollection
    );
  });
  it('启用态集合 owner 无需读取自己的 ACL，新建目录目标沿用创建授权', async () => {
    const { auth, move, actor, file, source, datasetId } = await fixture();
    await MongoDatasetCollection.updateOne({ _id: file._id }, { tmbId: actor.tmbId });
    await MongoResourcePermission.deleteMany({ resourceId: String(file._id) });
    const plannedId = String(new Types.ObjectId());
    await expect(
      authDatasetCollectionMoves({
        ...auth,
        datasetId,
        moves: [{ ...move, targetParentId: plannedId }],
        newFolderIds: new Set([plannedId]),
        creationParentIds: [String(source._id)]
      })
    ).resolves.toBeDefined();
  });
  it.each(['source-root', 'target-root'])('根级移动 %s 仍要求团队创建权限', async (mode) => {
    const { auth, move, file, owner } = await fixture();
    if (mode === 'source-root')
      await MongoDatasetCollection.updateOne({ _id: file._id }, { parentId: null });
    const selectedMove = {
      ...move,
      targetParentId: mode === 'target-root' ? null : move.targetParentId
    };
    await expect(authDatasetCollectionMoves({ ...auth, moves: [selectedMove] })).rejects.toBe(
      TeamErrEnum.unAuthTeam
    );
    await expect(
      authDatasetCollectionMoves({ ...auth, req: { auth: owner } as any, moves: [selectedMove] })
    ).resolves.toBeDefined();
  });
  it('HTTP 层以空串表示根目录，等价于 null', async () => {
    const { auth, move, owner } = await fixture();
    await expect(
      authDatasetCollectionMoves({ ...auth, moves: [{ ...move, targetParentId: '' }] })
    ).rejects.toBe(TeamErrEnum.unAuthTeam);
    await expect(
      authDatasetCollectionMoves({
        ...auth,
        req: { auth: owner } as any,
        moves: [{ ...move, targetParentId: '' }]
      })
    ).resolves.toBeDefined();
  });
  it('系统 root 可旁路资源 ACL；普通成员不能伪造团队归属', async () => {
    const { auth, move, source, grant } = await fixture();
    await grant(String(source._id), 0);
    await expect(
      authDatasetCollectionMoves({
        ...auth,
        req: { auth: { ...auth.req.auth, isRoot: true } } as any,
        moves: [{ ...move, targetParentId: null }]
      })
    ).resolves.toBeDefined();
    await expect(
      authDatasetCollectionMoves({
        ...auth,
        req: { auth: { ...auth.req.auth, teamId: String(new Types.ObjectId()) } } as any,
        moves: [move]
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDataset);
  });
  it.each(['dataset', 'team'])('拒绝损坏的 %s 归属，即使用户是 owner', async (field) => {
    const { auth, move, target, owner } = await fixture();
    await MongoDatasetCollection.updateOne(
      { _id: target._id },
      { [field === 'dataset' ? 'datasetId' : 'teamId']: new Types.ObjectId() }
    );
    await expect(
      authDatasetCollectionMoves({ ...auth, req: { auth: owner } as any, moves: [move] })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
  });
  it('根创建校验 dataset write；空计划需显式知识库，缺失资源和知识库明确拒绝', async () => {
    const { auth, datasetId, move, target, grant } = await fixture();
    await expect(
      authDatasetCollectionMoves({ ...auth, datasetId, moves: [], creationParentIds: [null] })
    ).resolves.toBeDefined();
    await grant(datasetId, ReadRoleVal, PerResourceTypeEnum.dataset);
    await expect(
      authDatasetCollectionMoves({ ...auth, datasetId, moves: [], creationParentIds: [null] })
    ).rejects.toBe(DatasetErrEnum.unAuthDataset);
    await expect(authDatasetCollectionMoves({ ...auth, moves: [] })).rejects.toBe(
      DatasetErrEnum.unExist
    );
    await expect(
      authDatasetCollectionMoves({ ...auth, datasetId: String(new Types.ObjectId()), moves: [] })
    ).rejects.toBe(DatasetErrEnum.unExist);
    await expect(
      authDatasetCollectionMoves({
        ...auth,
        moves: [{ ...move, collectionId: String(new Types.ObjectId()) }]
      })
    ).rejects.toBe(DatasetErrEnum.unExist);
    await MongoDatasetCollection.deleteOne({ _id: target._id });
    await expect(authDatasetCollectionMoves({ ...auth, moves: [move] })).rejects.toBe(
      DatasetErrEnum.unExist
    );
  });
});
