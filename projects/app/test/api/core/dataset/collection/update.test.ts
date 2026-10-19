import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import updateHandler from '@/pages/api/core/dataset/collection/update';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  ManageRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

const defaultSessionRun = vi.mocked(mongoSessionRun).getMockImplementation()!;
afterEach(() => vi.mocked(mongoSessionRun).mockImplementation(defaultSessionRun));

beforeEach(async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
    '@fastgpt/service/common/mongo/sessionRun'
  );
  vi.mocked(mongoSessionRun).mockImplementation(actual.mongoSessionRun);
});

const fixture = async () => {
  const users = await getFakeUsers(1);
  const actor = users.members[0];
  const dataset = await MongoDataset.create({
    teamId: actor.teamId,
    tmbId: users.owner.tmbId,
    name: 'update-test',
    collectionPermissionEnabled: true
  });
  const datasetId = String(dataset._id);
  const source = await MongoDatasetCollection.create({
    teamId: actor.teamId,
    datasetId,
    tmbId: users.owner.tmbId,
    name: 'source',
    type: DatasetCollectionTypeEnum.folder,
    inheritPermission: false
  });
  const target = await MongoDatasetCollection.create({
    teamId: actor.teamId,
    datasetId,
    tmbId: users.owner.tmbId,
    name: 'target',
    type: DatasetCollectionTypeEnum.folder,
    inheritPermission: false
  });
  const file = await MongoDatasetCollection.create({
    teamId: actor.teamId,
    datasetId,
    tmbId: users.owner.tmbId,
    name: 'file',
    type: DatasetCollectionTypeEnum.apiFile,
    parentId: source._id,
    inheritPermission: false
  });
  const grant = async (
    resourceId: string,
    permission: number,
    resourceType = PerResourceTypeEnum.collection
  ) => {
    await MongoResourcePermission.deleteMany({
      teamId: actor.teamId,
      resourceType,
      resourceId,
      tmbId: actor.tmbId
    });
    await MongoResourcePermission.create({
      teamId: actor.teamId,
      resourceType,
      resourceId,
      tmbId: actor.tmbId,
      permission
    });
  };
  await grant(datasetId, WriteRoleVal, PerResourceTypeEnum.dataset);
  await grant(String(source._id), ManageRoleVal);
  await grant(String(target._id), ManageRoleVal);
  await grant(String(file._id), ReadRoleVal);
  return { actor, owner: users.owner, datasetId, source, target, file, grant };
};

describe('update collection', () => {
  it('普通移动复用批量鉴权，只解析一次身份并实际落库', async () => {
    const { actor, file, target } = await fixture();
    vi.mocked(parseHeaderCert).mockClear();
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), parentId: String(target._id) }
    });
    expect(result.code).toBe(200);
    expect(parseHeaderCert).toHaveBeenCalledTimes(1);
    expect(String((await MongoDatasetCollection.findById(file._id).lean())?.parentId)).toBe(
      String(target._id)
    );
  });
  it('externalFileId 定位的 ObjectId 可正常移动，身份只解析一次', async () => {
    const { actor, datasetId, file, target } = await fixture();
    await MongoDatasetCollection.updateOne({ _id: file._id }, { externalFileId: 'external-move' });
    vi.mocked(parseHeaderCert).mockClear();
    const result = await Call(updateHandler, {
      auth: actor,
      body: { datasetId, externalFileId: 'external-move', parentId: String(target._id) }
    });
    expect(result.code).toBe(200);
    expect(String((await MongoDatasetCollection.findById(file._id).lean())?.parentId)).toBe(
      String(target._id)
    );
  });
  it.each(['source', 'target'] as const)('%s 只有 write 拒绝移动，保持原位置', async (side) => {
    const context = await fixture();
    await context.grant(String(context[side]._id), WriteRoleVal);
    const result = await Call(updateHandler, {
      auth: context.actor,
      body: { id: String(context.file._id), parentId: String(context.target._id) }
    });
    expect(result.code).not.toBe(200);
    expect(String((await MongoDatasetCollection.findById(context.file._id).lean())?.parentId)).toBe(
      String(context.source._id)
    );
  });
  it('普通字段修改继续要求节点 write，授权后可修改', async () => {
    const { actor, file, grant } = await fixture();
    const body = { id: String(file._id), name: 'renamed' };
    expect((await Call(updateHandler, { auth: actor, body })).code).not.toBe(200);
    await grant(String(file._id), WriteRoleVal);
    expect((await Call(updateHandler, { auth: actor, body })).code).toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.name).toBe('renamed');
  });
  it('权限允许时仍拒绝父目录移入后代', async () => {
    const { owner, source, target } = await fixture();
    await MongoDatasetCollection.updateOne({ _id: target._id }, { parentId: source._id });
    const result = await Call(updateHandler, {
      auth: owner,
      body: { id: String(source._id), parentId: String(target._id) }
    });
    expect(result.code).not.toBe(200);
    expect((await MongoDatasetCollection.findById(source._id).lean())?.parentId).toBeNull();
  });
  it('parentId 为空串移回根目录时校验团队创建权限并落库为 null', async () => {
    const { actor, owner, file, source } = await fixture();
    const denied = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), parentId: '' }
    });
    expect(denied.code).not.toBe(200);
    expect(String((await MongoDatasetCollection.findById(file._id).lean())?.parentId)).toBe(
      String(source._id)
    );

    const allowed = await Call(updateHandler, {
      auth: owner,
      body: { id: String(file._id), parentId: '' }
    });
    expect(allowed.code).toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.parentId).toBeNull();
  });

  it('为重命名、移动和启用状态分别写入一条内容对象审计', async () => {
    const { actor, datasetId, file, target, grant } = await fixture();
    await grant(String(file._id), WriteRoleVal);

    expect(
      (
        await Call(updateHandler, {
          auth: actor,
          body: { id: String(file._id), name: 'renamed' }
        })
      ).code
    ).toBe(200);
    expect(
      (
        await Call(updateHandler, {
          auth: actor,
          body: { id: String(file._id), parentId: String(target._id) }
        })
      ).code
    ).toBe(200);
    expect(
      (
        await Call(updateHandler, {
          auth: actor,
          body: { id: String(file._id), forbid: true }
        })
      ).code
    ).toBe(200);

    const logs = await MongoTeamAudit.find({
      teamId: actor.teamId,
      event: AuditEventEnum.UPDATE_DATASET_CONTENT_OBJECT
    })
      .sort({ timestamp: 1 })
      .lean();

    expect(logs).toHaveLength(3);
    expect(logs.map((log) => log.metadata)).toEqual([
      expect.objectContaining({
        datasetId,
        collectionId: String(file._id),
        collectionName: 'file',
        action: 'rename',
        oldValue: 'file',
        newValue: 'renamed'
      }),
      expect.objectContaining({
        collectionId: String(file._id),
        action: 'move',
        oldValue: 'update-test/source/renamed',
        newValue: 'update-test/target/renamed'
      }),
      expect.objectContaining({
        collectionId: String(file._id),
        action: 'disable',
        oldValue: 'account_team:dataset_content_status_enabled',
        newValue: 'account_team:dataset_content_status_disabled'
      })
    ]);
  });

  it('文件夹禁用只记录文件夹自身，子 collection 只执行状态级联', async () => {
    const { actor, source, file } = await fixture();
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(source._id), forbid: true }
    });

    expect(result.code).toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.forbid).toBe(true);

    const logs = await MongoTeamAudit.find({
      teamId: actor.teamId,
      event: AuditEventEnum.UPDATE_DATASET_CONTENT_OBJECT
    }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toEqual(
      expect.objectContaining({
        collectionId: String(source._id),
        collectionName: 'source',
        action: 'disable',
        oldValue: 'account_team:dataset_content_status_enabled',
        newValue: 'account_team:dataset_content_status_disabled'
      })
    );
  });
});
