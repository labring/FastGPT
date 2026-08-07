import { describe, expect, it, beforeAll } from 'vitest';
import { Types } from 'mongoose';
import handler from '@/pages/api/core/dataset/listV2';
import oldHandler from '@/pages/api/core/dataset/list';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type {
  ListDatasetV2Body,
  ListDatasetV2Response
} from '@fastgpt/global/openapi/core/dataset/api';

// 测试环境无系统模型配置，初始化 global 模型 map 使 v2 响应 schema 的 vectorModel 可 parse（生产由启动时配置加载）
const testEmbeddingModel: EmbeddingModelItemType = {
  model: 'text-embedding-3',
  name: 'Embedding',
  provider: 'openai',
  type: ModelTypeEnum.embedding,
  defaultToken: 1000,
  maxToken: 8000,
  weight: 100
};

beforeAll(() => {
  globalThis.embeddingModelMap = new Map([['text-embedding-3', testEmbeddingModel]]);
  globalThis.systemDefaultModel = { embedding: testEmbeddingModel };
});

const createDataset = (data: {
  name: string;
  teamId: string;
  tmbId: string;
  type?: DatasetTypeEnum;
  parentId?: string | null;
  inheritPermission?: boolean;
  updateTime?: Date;
}) =>
  MongoDataset.create({
    name: data.name,
    type: data.type ?? DatasetTypeEnum.dataset,
    teamId: data.teamId,
    tmbId: data.tmbId,
    vectorModel: testEmbeddingModel.model,
    ...(data.parentId !== undefined
      ? { parentId: data.parentId ? new Types.ObjectId(data.parentId) : null }
      : {}),
    ...(data.inheritPermission !== undefined ? { inheritPermission: data.inheritPermission } : {}),
    ...(data.updateTime !== undefined ? { updateTime: data.updateTime } : {})
  });

describe('POST /api/core/dataset/listV2', () => {
  it('owner + 无 parentId：v2 与旧接口均返回全团队（相等）', async () => {
    const owner = await getUser(`listv2-ds-owner-${getNanoid(6)}`);
    await createDataset({ name: 'D1', teamId: owner.teamId, tmbId: owner.tmbId });

    const res = await Call<ListDatasetV2Body, Record<string, never>, ListDatasetV2Response>(
      handler,
      { auth: owner, body: { pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: owner, body: {} });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item) => String(item._id))).toEqual(
      oldRes.data.map((item: { _id: string }) => String(item._id))
    );
  });

  it('owner + parentId：目录过滤，与旧接口一致（相等）', async () => {
    const owner = await getUser(`listv2-ds-dir-${getNanoid(6)}`);
    const folder = await createDataset({
      name: 'Folder',
      type: DatasetTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await createDataset({
      name: 'In Folder',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: String(folder._id)
    });
    await createDataset({ name: 'Root', teamId: owner.teamId, tmbId: owner.tmbId });

    const res = await Call<ListDatasetV2Body, Record<string, never>, ListDatasetV2Response>(
      handler,
      { auth: owner, body: { parentId: String(folder._id), pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: owner, body: { parentId: String(folder._id) } });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item) => String(item._id))).toEqual(
      oldRes.data.map((item: { _id: string }) => String(item._id))
    );
  });

  it('searchKey：搜索不带 type 过滤（复刻旧语义），v2 与旧一致', async () => {
    const owner = await getUser(`listv2-ds-search-${getNanoid(6)}`);
    await createDataset({
      name: 'Searchable DS',
      type: DatasetTypeEnum.websiteDataset,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });

    const res = await Call<ListDatasetV2Body, Record<string, never>, ListDatasetV2Response>(
      handler,
      { auth: owner, body: { searchKey: 'Searchable' } }
    );
    const oldRes = await Call(oldHandler, { auth: owner, body: { searchKey: 'Searchable' } });

    expect(res.code).toBe(200);
    // websiteDataset 类型在搜索中不被 type 过滤掉（旧语义）
    expect(res.data.total).toBe(1);
    expect(res.data.list.map((item) => String(item._id))).toEqual(
      oldRes.data.map((item: { _id: string }) => String(item._id))
    );
  });

  it('非 owner tmb 直授：v2 与旧一致（相等）', async () => {
    const owner = await getUser(`listv2-ds-nonowner-${getNanoid(6)}`);
    const member = await getUser(`listv2-ds-nonowner-m-${getNanoid(6)}`, owner.teamId);

    const granted = await createDataset({
      name: 'Granted',
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await createDataset({ name: 'Not Granted', teamId: owner.teamId, tmbId: owner.tmbId });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: owner.teamId,
      resourceId: granted._id,
      tmbId: member.tmbId,
      permission: ReadRoleVal
    });

    const res = await Call<ListDatasetV2Body, Record<string, never>, ListDatasetV2Response>(
      handler,
      { auth: member, body: { pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: member, body: {} });

    expect(res.code).toBe(200);
    const v2Ids = res.data.list.map((item) => String(item._id));
    const oldIds = oldRes.data.map((item: { _id: string }) => String(item._id));
    expect(v2Ids).toEqual(oldIds);
    expect(v2Ids).toContain(String(granted._id));
  });

  it('非 owner + 目录继承（父文件夹 read → 子 dataset 可见），与旧一致', async () => {
    const owner = await getUser(`listv2-ds-inherit-${getNanoid(6)}`);
    const member = await getUser(`listv2-ds-inherit-m-${getNanoid(6)}`, owner.teamId);

    const folder = await createDataset({
      name: 'Folder',
      type: DatasetTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const child = await createDataset({
      name: 'Child',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: String(folder._id),
      inheritPermission: true
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: owner.teamId,
      resourceId: folder._id,
      tmbId: member.tmbId,
      permission: ReadRoleVal
    });

    const res = await Call<ListDatasetV2Body, Record<string, never>, ListDatasetV2Response>(
      handler,
      { auth: member, body: { parentId: String(folder._id), pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: member, body: { parentId: String(folder._id) } });

    expect(res.code).toBe(200);
    const v2Ids = res.data.list.map((item) => String(item._id));
    expect(v2Ids).toContain(String(child._id));
    expect(v2Ids).toEqual(oldRes.data.map((item: { _id: string }) => String(item._id)));
  });

  it('分页：total 为全量计数（25 条 / pageSize 10 → total 25、list 10）', async () => {
    const owner = await getUser(`listv2-ds-paging-${getNanoid(6)}`);
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        createDataset({ name: `DS ${i}`, teamId: owner.teamId, tmbId: owner.tmbId })
      )
    );

    const res = await Call<ListDatasetV2Body, Record<string, never>, ListDatasetV2Response>(
      handler,
      { auth: owner, body: { pageSize: 10, pageNum: 1 } }
    );

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(25);
    expect(res.data.list).toHaveLength(10);
    expect(res.data.total).toBeGreaterThan(res.data.list.length);
  });

  it('orphan（tmbId 不存在）：v2 保留 + 占位，旧接口丢项', async () => {
    const owner = await getUser(`listv2-ds-orphan-${getNanoid(6)}`);
    await createDataset({
      name: 'Orphan DS',
      teamId: owner.teamId,
      tmbId: new Types.ObjectId().toString()
    });

    const res = await Call<ListDatasetV2Body, Record<string, never>, ListDatasetV2Response>(
      handler,
      { auth: owner, body: { pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: owner, body: {} });

    expect(res.code).toBe(200);
    const v2Orphan = res.data.list.find((item) => item.name === 'Orphan DS');
    expect(v2Orphan).toBeDefined();
    expect(v2Orphan!.sourceMember).toEqual({ name: '未知成员', avatar: null, status: null });
    const oldIds = oldRes.data.map((item: { _id: string }) => String(item._id));
    expect(oldIds).not.toContain(String(v2Orphan!._id));
  });
});
