import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import handler from '@/pages/api/core/app/listV2';
import oldHandler from '@/pages/api/core/app/list';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ReadRoleVal, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type {
  ListAppV2BodyType,
  ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';

const createApp = (data: {
  name: string;
  teamId: string;
  tmbId: string;
  type?: AppTypeEnum;
  parentId?: string | null;
  inheritPermission?: boolean;
  deleteTime?: Date | null;
  updateTime?: Date;
}) =>
  MongoApp.create({
    name: data.name,
    type: data.type ?? AppTypeEnum.workflow,
    teamId: data.teamId,
    tmbId: data.tmbId,
    ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
    ...(data.inheritPermission !== undefined ? { inheritPermission: data.inheritPermission } : {}),
    ...(data.deleteTime !== undefined ? { deleteTime: data.deleteTime } : {}),
    ...(data.updateTime !== undefined ? { updateTime: data.updateTime } : {})
  });

const grantRead = ({
  teamId,
  resourceId,
  tmbId,
  permission = ReadRoleVal
}: {
  teamId: string;
  resourceId: Types.ObjectId;
  tmbId: string;
  permission?: number;
}) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.app,
    teamId,
    resourceId,
    tmbId,
    permission
  });

describe('POST /api/core/app/listV2', () => {
  it('owner + 无 parentId：v2 返回全团队（含子目录），旧接口仅根目录（预期不相等）', async () => {
    const owner = await getUser(`listv2-app-owner-all-${getNanoid(6)}`);

    const rootApp = await createApp({ name: 'Root App', teamId: owner.teamId, tmbId: owner.tmbId });
    const folder = await createApp({
      name: 'Folder',
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const childApp = await createApp({
      name: 'Child App',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: String(folder._id)
    });

    const oldRes = await Call(handler, {
      auth: owner,
      body: {}
    });
    const oldList = await Call(oldHandler, { auth: owner, body: {} });

    expect(oldRes.code).toBe(200);
    expect(oldList.code).toBe(200);
    const v2Ids = oldRes.data.list.map((item: { _id: string }) => String(item._id));
    const oldIds = oldList.data.map((item: { _id: string }) => String(item._id));

    // v2 = 全团队；旧 owner 无 parentId 仅根目录（Root App + Folder）
    expect(v2Ids).toContain(String(childApp._id));
    expect(v2Ids).toContain(String(rootApp._id));
    expect(oldIds).not.toContain(String(childApp._id));
    expect(oldIds).toContain(String(rootApp._id));
    // 预期不相等断言（差异 4）
    expect(v2Ids).not.toEqual(oldIds);
  });

  it('owner + parentId：目录内列表与旧接口一致（预期相等）', async () => {
    const owner = await getUser(`listv2-app-owner-dir-${getNanoid(6)}`);

    const folder = await createApp({
      name: 'Folder',
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await createApp({
      name: 'In Folder',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: String(folder._id)
    });
    await createApp({ name: 'Root Only', teamId: owner.teamId, tmbId: owner.tmbId });

    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: owner, body: { parentId: String(folder._id), pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: owner, body: { parentId: String(folder._id) } });

    expect(res.code).toBe(200);
    const v2Ids = res.data.list.map((item) => String(item._id));
    const oldIds = oldRes.data.map((item: { _id: string }) => String(item._id));
    expect(v2Ids).toEqual(oldIds);
  });

  it('owner + searchKey：全局搜索（相等）', async () => {
    const owner = await getUser(`listv2-app-owner-search-${getNanoid(6)}`);
    await createApp({ name: 'Searchable App X', teamId: owner.teamId, tmbId: owner.tmbId });

    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: owner, body: { searchKey: 'Searchable' } }
    );
    const oldRes = await Call(oldHandler, { auth: owner, body: { searchKey: 'Searchable' } });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(1);
    expect(res.data.list.map((item) => String(item._id))).toEqual(
      oldRes.data.map((item: { _id: string }) => String(item._id))
    );
  });

  it('非 owner tmb 直授：v2 与旧接口可见集合一致（预期相等）', async () => {
    const owner = await getUser(`listv2-app-nonowner-${getNanoid(6)}`);
    const member = await getUser(`listv2-app-nonowner-m-${getNanoid(6)}`, owner.teamId);

    const granted = await createApp({ name: 'Granted', teamId: owner.teamId, tmbId: owner.tmbId });
    await createApp({ name: 'Not Granted', teamId: owner.teamId, tmbId: owner.tmbId });
    await grantRead({ teamId: owner.teamId, resourceId: granted._id, tmbId: member.tmbId });

    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
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

  it('permission=0 + parent read 反例：v2 与旧接口均可见（预期相等，AnyRecorded 覆盖）', async () => {
    const owner = await getUser(`listv2-app-zero-owner-${getNanoid(6)}`);
    const member = await getUser(`listv2-app-zero-m-${getNanoid(6)}`, owner.teamId);

    const folder = await createApp({
      name: 'Folder',
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const child = await createApp({
      name: 'Child',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: String(folder._id),
      inheritPermission: true
    });

    await grantRead({ teamId: owner.teamId, resourceId: folder._id, tmbId: member.tmbId });
    // 成员对 child 有一条 permission=0 的个人记录（AnyRecorded 含、ReadableDirect 不含）
    await grantRead({
      teamId: owner.teamId,
      resourceId: child._id,
      tmbId: member.tmbId,
      permission: 0
    });

    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: member, body: { pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: member, body: {} });

    expect(res.code).toBe(200);
    expect(oldRes.code).toBe(200);
    const v2Ids = res.data.list.map((item) => String(item._id));
    const oldIds = oldRes.data.map((item: { _id: string }) => String(item._id));
    // 经父目录继承，child 两侧均可见 → 预期相等
    expect(v2Ids).toContain(String(child._id));
    expect(v2Ids).toEqual(oldIds);
  });

  it('跨目录创建者（无权限记录）：v2 可见、旧不可见（预期不相等）', async () => {
    const owner = await getUser(`listv2-app-creator-owner-${getNanoid(6)}`);
    const member = await getUser(`listv2-app-creator-m-${getNanoid(6)}`, owner.teamId);

    const folderB = await createApp({
      name: 'Folder B',
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    // 成员在目录 B 内创建 app（直接建表，不写权限记录 → 无记录创建者）
    await createApp({
      name: 'Member Created',
      teamId: owner.teamId,
      tmbId: member.tmbId,
      parentId: String(folderB._id)
    });

    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: member, body: { pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: member, body: {} });

    expect(res.code).toBe(200);
    const v2Ids = res.data.list.map((item) => String(item._id));
    const oldIds = oldRes.data.map((item: { _id: string }) => String(item._id));
    // v2 显示跨目录无记录创建者，旧不显示
    expect(v2Ids.length).toBeGreaterThan(oldIds.length);
  });

  it('分页：total 为全量 match 计数，total > list.length（25 条 / pageSize 10）', async () => {
    const owner = await getUser(`listv2-app-paging-${getNanoid(6)}`);
    const apps = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        createApp({ name: `App ${i}`, teamId: owner.teamId, tmbId: owner.tmbId })
      )
    );

    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: owner, body: { pageSize: 10, pageNum: 1 } }
    );

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(25);
    expect(res.data.list).toHaveLength(10);
    expect(res.data.total).toBeGreaterThan(res.data.list.length);

    // 第二页不重复、不遗漏
    const res2 = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: owner, body: { pageSize: 10, pageNum: 2 } }
    );
    const page1Ids = res.data.list.map((item) => String(item._id));
    const page2Ids = res2.data.list.map((item) => String(item._id));
    expect(page1Ids).not.toEqual(page2Ids);
    const allIds = [...page1Ids, ...page2Ids];
    expect(new Set(allIds).size).toBe(20);
    expect(apps.length).toBe(25);
  });

  it('orphan（tmbId 指向不存在成员）：v2 保留 + 占位，旧接口丢项', async () => {
    const owner = await getUser(`listv2-app-orphan-${getNanoid(6)}`);
    const orphanApp = await createApp({
      name: 'Orphan App',
      teamId: owner.teamId,
      tmbId: new Types.ObjectId().toString()
    });

    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: owner, body: { pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: owner, body: {} });

    expect(res.code).toBe(200);
    const v2Orphan = res.data.list.find((item) => String(item._id) === String(orphanApp._id));
    expect(v2Orphan).toBeDefined();
    expect(v2Orphan!.sourceMember).toEqual({ name: '未知成员', avatar: null, status: null });
    // 旧接口 addSourceMember 丢项
    const oldIds = oldRes.data.map((item: { _id: string }) => String(item._id));
    expect(oldIds).not.toContain(String(orphanApp._id));
  });

  it('fail-fast：非 owner 可读资源超过阈值 → 明确错误码', async () => {
    const owner = await getUser(`listv2-app-limit-owner-${getNanoid(6)}`);
    const member = await getUser(`listv2-app-limit-m-${getNanoid(6)}`, owner.teamId);

    // 一次性插入 10001 条成员直授记录（超过 READABLE_IDS_LIMIT=10000）
    const resourceIds = Array.from({ length: 10001 }, () => new Types.ObjectId());
    await MongoResourcePermission.insertMany(
      resourceIds.map((resourceId) => ({
        resourceType: PerResourceTypeEnum.app,
        teamId: owner.teamId,
        resourceId,
        tmbId: member.tmbId,
        permission: ReadPermissionVal
      }))
    );

    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: member, body: {} }
    );

    expect(res.code).not.toBe(200);
    expect(res.error).toBe(CommonErrEnum.tooManyReadableResources);
  });
});
