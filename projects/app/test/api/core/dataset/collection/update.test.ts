import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import updateHandler from '@/pages/api/core/dataset/collection/update';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import type {
  CollectionTagValueType,
  DatasetCollectionTagType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
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
import { getFakeUsers, getRootUser } from '@test/datas/users';
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
  it('scopes move ancestor lookups to the source dataset', async () => {
    const { owner, source, target, file } = await fixture();
    const otherDataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'other-dataset'
    });
    const foreignAncestor = await MongoDatasetCollection.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: otherDataset._id,
      name: 'foreign-ancestor',
      type: DatasetCollectionTypeEnum.folder
    });
    await MongoDatasetCollection.updateOne({ _id: target._id }, { parentId: foreignAncestor._id });
    const result = await Call(updateHandler, {
      auth: owner,
      body: { id: String(file._id), parentId: String(target._id) }
    });
    expect(result.error).toBe(CommonErrEnum.invalidParams);
    expect(String((await MongoDatasetCollection.findById(file._id).lean())?.parentId)).toBe(
      String(source._id)
    );
  });

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
  it('system root updates collections across team boundaries using the resource team', async () => {
    const { owner, file } = await fixture();
    const root = await getRootUser();

    const result = await Call(updateHandler, {
      auth: root,
      body: { id: String(file._id), name: 'root-renamed' }
    });

    expect(result.code).toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.name).toBe('root-renamed');
    await vi.waitFor(async () => {
      const logs = await MongoTeamAudit.find({
        teamId: owner.teamId,
        event: DatasetAuditEventEnum.DATASET_COLLECTION_UPDATE
      }).lean();
      expect(logs).toHaveLength(1);
      expect(String(logs[0].tmbId)).toBe(root.tmbId);
    });
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
  it('普通字段修改要求节点 manage：write 被拒、manage 通过', async () => {
    const { actor, file, grant } = await fixture();
    const body = { id: String(file._id), name: 'renamed' };
    // fixture 只给 file 授予 read
    expect((await Call(updateHandler, { auth: actor, body })).code).not.toBe(200);
    await grant(String(file._id), WriteRoleVal);
    expect((await Call(updateHandler, { auth: actor, body })).code).not.toBe(200);
    await grant(String(file._id), ManageRoleVal);
    expect((await Call(updateHandler, { auth: actor, body })).code).toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.name).toBe('renamed');
  });
  it('移动同请求携带字段更新时仍要求节点 manage，不能借移动绕过', async () => {
    const { actor, file, source, target } = await fixture();
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), parentId: String(target._id), name: 'renamed' }
    });
    expect(result.code).not.toBe(200);
    const updated = await MongoDatasetCollection.findById(file._id).lean();
    expect(updated?.name).toBe('file');
    expect(String(updated?.parentId)).toBe(String(source._id));
  });
  it('externalFileId 定位只需 dataset read，更新由节点 manage 把关', async () => {
    const { actor, datasetId, file, grant } = await fixture();
    await MongoDatasetCollection.updateOne({ _id: file._id }, { externalFileId: 'external-meta' });
    await grant(datasetId, ReadRoleVal, PerResourceTypeEnum.dataset);
    await grant(String(file._id), ManageRoleVal);

    const result = await Call(updateHandler, {
      auth: actor,
      body: { datasetId, externalFileId: 'external-meta', name: 'renamed-by-external' }
    });
    expect(result.code).toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.name).toBe(
      'renamed-by-external'
    );
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
    const { actor, file, target, grant } = await fixture();
    await grant(String(file._id), ManageRoleVal);

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

    await vi.waitFor(
      async () => {
        const logs = await MongoTeamAudit.find({
          teamId: actor.teamId,
          event: 'dataset.collection.update'
        })
          .sort({ timestamp: 1 })
          .lean();

        expect(logs).toHaveLength(3);
        // 每条日志记录执行当时的名字：改名后后续两条已是新名
        expect(logs.map((log) => log.metadata)).toEqual([
          expect.objectContaining({
            datasetName: 'update-test',
            collectionName: 'file',
            action: 'rename',
            oldValue: 'file',
            newValue: 'renamed'
          }),
          expect.objectContaining({
            collectionName: 'renamed',
            action: 'move',
            oldValue: 'update-test/source/renamed',
            newValue: 'update-test/target/renamed'
          }),
          expect.objectContaining({
            collectionName: 'renamed',
            action: 'disable',
            oldValue: 'account_team:dataset_content_status_enabled',
            newValue: 'account_team:dataset_content_status_disabled'
          })
        ]);
      },
      { timeout: 5000 }
    );
  });

  it('重命名与移动合并时仍各自一条日志，位置使用新名称', async () => {
    const { actor, file, target, grant } = await fixture();
    await grant(String(file._id), ManageRoleVal);

    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), name: 'renamed', parentId: String(target._id) }
    });
    expect(result.code).toBe(200);

    await vi.waitFor(
      async () => {
        const logs = await MongoTeamAudit.find({
          teamId: actor.teamId,
          event: 'dataset.collection.update'
        })
          .sort({ timestamp: 1 })
          .lean();

        expect(logs.map((log) => log.metadata?.action)).toEqual(['rename', 'move']);
        expect(logs[1].metadata).toEqual(
          expect.objectContaining({
            oldValue: 'update-test/source/file',
            newValue: 'update-test/target/renamed'
          })
        );
      },
      { timeout: 5000 }
    );
  });

  it('鉴权后另一请求禁用集合，本次恢复启用仍记录真实状态变化', async () => {
    const { actor, file, grant } = await fixture();
    await grant(String(file._id), ManageRoleVal);
    const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
      '@fastgpt/service/common/mongo/sessionRun'
    );

    // 外层请求已读到 forbid=false，在进入事务前让另一个完整请求先提交禁用。
    vi.mocked(mongoSessionRun).mockImplementationOnce(async (callback) => {
      const concurrent = await Call(updateHandler, {
        auth: actor,
        body: { id: String(file._id), forbid: true }
      });
      expect(concurrent.code).toBe(200);
      return actual.mongoSessionRun(callback);
    });
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), forbid: false }
    });

    expect(result.code).toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.forbid).toBe(false);
    await vi.waitFor(async () => {
      const logs = await MongoTeamAudit.find({
        teamId: actor.teamId,
        event: DatasetAuditEventEnum.DATASET_COLLECTION_UPDATE
      }).lean();
      expect(logs).toHaveLength(2);
      expect(logs.map((log) => log.metadata?.action).sort()).toEqual(['disable', 'enable']);
    });
  });

  it('事务重试重新读取名称和位置，只审计最终提交的差异', async () => {
    const { actor, file, source, target, grant } = await fixture();
    await grant(String(file._id), ManageRoleVal);
    const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
      '@fastgpt/service/common/mongo/sessionRun'
    );
    let attempts = 0;

    vi.mocked(mongoSessionRun).mockImplementationOnce((callback) =>
      actual.mongoSessionRun(async (session) => {
        attempts += 1;
        if (attempts === 2) {
          // 第一次尝试已回滚，模拟另一请求抢先完成改名和移动。
          await MongoDatasetCollection.updateOne(
            { _id: file._id },
            { $set: { name: 'concurrent', parentId: target._id } }
          );
        }
        const result = await callback(session);
        if (attempts === 1) {
          throw new actual.MongoTransactionConflictError(new Error('retry-audit-snapshot'));
        }
        return result;
      })
    );
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), name: 'renamed', parentId: String(source._id) }
    });

    expect(result.code).toBe(200);
    expect(attempts).toBe(2);
    const updated = await MongoDatasetCollection.findById(file._id).lean();
    expect(updated?.name).toBe('renamed');
    expect(String(updated?.parentId)).toBe(String(source._id));
    await vi.waitFor(async () => {
      const logs = await MongoTeamAudit.find({
        teamId: actor.teamId,
        event: DatasetAuditEventEnum.DATASET_COLLECTION_UPDATE
      })
        .sort({ _id: 1 })
        .lean();
      expect(logs.map((log) => log.metadata)).toMatchObject([
        {
          collectionName: 'concurrent',
          action: 'rename',
          oldValue: 'concurrent',
          newValue: 'renamed'
        },
        {
          collectionName: 'concurrent',
          action: 'move',
          oldValue: 'update-test/target/concurrent',
          newValue: 'update-test/source/renamed'
        }
      ]);
    });
  });

  it('事务回滚时不记录属性变更', async () => {
    const { actor, file, grant } = await fixture();
    await grant(String(file._id), ManageRoleVal);
    const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
      '@fastgpt/service/common/mongo/sessionRun'
    );
    vi.mocked(mongoSessionRun).mockImplementationOnce((callback) =>
      actual.mongoSessionRun(async (session) => {
        await callback(session);
        throw new Error('abort-attribute-update');
      })
    );
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), name: 'rolled-back', forbid: true }
    });

    expect(result.code).not.toBe(200);
    const updated = await MongoDatasetCollection.findById(file._id).lean();
    expect(updated?.name).toBe('file');
    expect(Boolean(updated?.forbid)).toBe(false);
    expect(await MongoTeamAudit.countDocuments({ teamId: actor.teamId })).toBe(0);
  });

  it('无实际变更时不写入审计', async () => {
    const { actor, file, grant } = await fixture();
    await grant(String(file._id), ManageRoleVal);

    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), name: 'file', forbid: false }
    });
    expect(result.code).toBe(200);

    const logs = await MongoTeamAudit.find({
      teamId: actor.teamId,
      event: 'dataset.collection.update'
    }).lean();
    expect(logs).toHaveLength(0);
  });

  it('文件夹禁用只记录文件夹自身，子 collection 只执行状态级联', async () => {
    const { actor, source, file } = await fixture();
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(source._id), forbid: true }
    });

    expect(result.code).toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.forbid).toBe(true);

    await vi.waitFor(
      async () => {
        const logs = await MongoTeamAudit.find({
          teamId: actor.teamId,
          event: 'dataset.collection.update'
        }).lean();
        expect(logs).toHaveLength(1);
        expect(logs[0].metadata).toEqual(
          expect.objectContaining({
            collectionName: 'source',
            action: 'disable',
            oldValue: 'account_team:dataset_content_status_enabled',
            newValue: 'account_team:dataset_content_status_disabled'
          })
        );
      },
      { timeout: 5000 }
    );
  });
});

describe('update collection tag audit', () => {
  /** 使用真实标签定义和持久化旧值，验证公开入口与专用标签接口的审计语义一致。 */
  const tagFixture = async ({
    tagType = 'string',
    initialValue
  }: {
    tagType?: DatasetCollectionTagType;
    initialValue?: CollectionTagValueType['value'];
  }) => {
    const context = await fixture();
    const { actor, file, datasetId, grant } = context;
    await grant(String(file._id), ManageRoleVal);
    const tag = await MongoDatasetCollectionTagsV2.create({
      teamId: actor.teamId,
      datasetId,
      tag: '部门',
      tagType
    });
    const tagId = String(tag._id);
    if (initialValue !== undefined) {
      await MongoDatasetCollection.updateOne(
        { _id: file._id },
        { $set: { tags: [{ tagId, value: initialValue }] } }
      );
    }
    return { ...context, tagId };
  };

  it('仅清空标签时记录实际移除的标签', async () => {
    const { actor, file } = await tagFixture({ initialValue: '研发部' });
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), tags: [] }
    });

    expect(result.code).toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.tags).toEqual([]);
    await vi.waitFor(async () => {
      const logs = await MongoTeamAudit.find({ teamId: actor.teamId }).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE,
        metadata: { datasetName: 'update-test', collectionName: 'file', tagName: '部门' }
      });
    });
  });

  it.each([
    { tagType: 'string', initialValue: undefined, value: '', storedValue: '', action: 'add' },
    {
      tagType: 'string',
      initialValue: '研发部',
      value: '销售部',
      storedValue: '销售部',
      action: 'add'
    },
    { tagType: 'number', initialValue: 1, value: '0', storedValue: 0, action: 'add' },
    { tagType: 'number', initialValue: 1, value: '1.00', storedValue: 1, action: 'none' },
    {
      tagType: 'array',
      initialValue: ['研发部', '测试部'],
      value: ['研发部'],
      storedValue: ['研发部'],
      action: 'remove'
    },
    {
      tagType: 'array',
      initialValue: ['研发部', '测试部'],
      value: ['测试部', '研发部', '研发部'],
      storedValue: ['测试部', '研发部', '研发部'],
      action: 'none'
    }
  ] satisfies Array<{
    tagType: DatasetCollectionTagType;
    initialValue?: CollectionTagValueType['value'];
    value: CollectionTagValueType['value'];
    storedValue: CollectionTagValueType['value'];
    action: 'add' | 'remove' | 'none';
  }>)(
    '按实际写入值审计 $tagType 标签：$action',
    async ({ tagType, initialValue, value, storedValue, action }) => {
      const { actor, file, tagId } = await tagFixture({ tagType, initialValue });
      const result = await Call(updateHandler, {
        auth: actor,
        body: { id: String(file._id), tags: [{ tag: '部门', value }] }
      });

      expect(result.code).toBe(200);
      expect((await MongoDatasetCollection.findById(file._id).lean())?.tags).toEqual([
        { tagId, value: storedValue }
      ]);
      await vi.waitFor(async () => {
        const logs = await MongoTeamAudit.find({ teamId: actor.teamId }).lean();
        expect(logs).toHaveLength(action === 'none' ? 0 : 1);
        if (action !== 'none') {
          expect(logs[0]).toMatchObject({
            event:
              action === 'add'
                ? DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD
                : DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE,
            metadata: { datasetName: 'update-test', collectionName: 'file', tagName: '部门' }
          });
        }
      });
    }
  );

  it('重命名与替换标签合并提交时同时记录属性、新增和移除', async () => {
    const { actor, file, datasetId } = await tagFixture({ initialValue: '研发部' });
    await MongoDatasetCollectionTagsV2.create({
      teamId: actor.teamId,
      datasetId,
      tag: '优先级',
      tagType: 'string'
    });
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), name: 'renamed', tags: [{ tag: '优先级', value: 'P0' }] }
    });

    expect(result.code).toBe(200);
    await vi.waitFor(async () => {
      const logs = await MongoTeamAudit.find({ teamId: actor.teamId }).sort({ _id: 1 }).lean();
      expect(logs).toHaveLength(3);
      expect(logs).toMatchObject([
        { event: DatasetAuditEventEnum.DATASET_COLLECTION_UPDATE, metadata: { action: 'rename' } },
        {
          event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD,
          metadata: { tagName: '优先级' }
        },
        {
          event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE,
          metadata: { tagName: '部门' }
        }
      ]);
    });
  });

  it('旧格式字符串输入规范化后也记录标签变更', async () => {
    const { actor, file } = await tagFixture({});
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), tags: ['研发部', '测试部'] }
    });

    expect(result.code).toBe(200);
    const carrier = await MongoDatasetCollectionTagsV2.findOne({
      teamId: actor.teamId,
      datasetId: file.datasetId,
      fromMigration: true
    }).lean();
    expect(carrier).not.toBeNull();
    await vi.waitFor(async () => {
      const logs = await MongoTeamAudit.find({ teamId: actor.teamId }).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD,
        metadata: { tagName: carrier?.tag }
      });
    });
  });

  it('标签写入失败时回滚且不记录审计', async () => {
    const { actor, file, tagId } = await tagFixture({ initialValue: '研发部' });
    vi.spyOn(MongoDatasetCollection, 'updateOne').mockRejectedValueOnce(new Error('write-failed'));
    const result = await Call(updateHandler, {
      auth: actor,
      body: { id: String(file._id), tags: [] }
    });

    expect(result.code).not.toBe(200);
    expect((await MongoDatasetCollection.findById(file._id).lean())?.tags).toEqual([
      { tagId, value: '研发部' }
    ]);
    expect(await MongoTeamAudit.countDocuments({ teamId: actor.teamId })).toBe(0);
  });
});

it('rejects moving into a leaf even when the target is manageable', async () => {
  const { owner, source, target } = await fixture();
  await MongoDatasetCollection.updateOne(
    { _id: target._id },
    { type: DatasetCollectionTypeEnum.virtual }
  );
  const res = await Call(updateHandler, {
    auth: owner,
    body: { id: String(source._id), parentId: String(target._id) }
  });
  expect(res.error).toBe(CommonErrEnum.invalidParams);
  expect((await MongoDatasetCollection.findById(source._id).lean())?.parentId).toBeNull();
});
