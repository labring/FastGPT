import handler from '@/pages/api/core/app/listV2';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { AppListSortEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  ListAppV2BodyType,
  ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('POST /api/core/app/listV2 - appIds', () => {
  it.each([false, true])(
    '跨目录返回全部指定资源，并排除已删除资源（pinnedFirst=%s）',
    async (pinnedFirst) => {
      const user = await getUser(`app-ids-${getNanoid(6)}`);
      const parentId = new Types.ObjectId();
      const apps = await MongoApp.create(
        Array.from({ length: 51 }, (_, index) => ({
          name: `Selected ${index}`,
          type: [AppTypeEnum.folder, AppTypeEnum.workflowTool, AppTypeEnum.workflow][index % 3],
          teamId: user.teamId,
          tmbId: user.tmbId,
          parentId: index % 2 ? parentId : null,
          isPinned: index === 0,
          pinnedAt: index === 0 ? new Date() : undefined
        }))
      );
      const [deleted] = await MongoApp.create([
        {
          name: 'Deleted',
          teamId: user.teamId,
          tmbId: user.tmbId,
          deleteTime: new Date()
        },
        { name: 'Not requested', teamId: user.teamId, tmbId: user.tmbId }
      ]);
      const ids = apps.map((app) => String(app._id));
      const response = await Call<unknown, Record<string, never>, ListAppV2ResponseType>(handler, {
        auth: user,
        body: {
          appIds: [...ids, ids[0], String(deleted._id), String(new Types.ObjectId())],
          parentId: String(new Types.ObjectId()),
          pageNum: 3,
          pageSize: 1,
          offset: 1000,
          pinnedFirst,
          withRelatedAppCount: true
        }
      });

      expect(response.code).toBe(200);
      expect(response.data.total).toBe(51);
      expect(response.data.list.map((app) => String(app._id)).sort()).toEqual([...ids].sort());
      expect(response.data.list.every((app) => app.permission.hasReadPer)).toBe(true);
      expect(response.data.list.find((app) => app.type === AppTypeEnum.workflowTool)).toMatchObject(
        {
          relatedAppCount: 0,
          sourceMember: { name: expect.any(String) }
        }
      );
      if (pinnedFirst) expect(String(response.data.list[0]._id)).toBe(ids[0]);
    }
  );

  it('指定 ID 与团队及读取权限取交集，权限撤销后返回空列表', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const outsider = await getUser(`app-ids-other-team-${getNanoid(6)}`);
    const [readable, notRequested, forbidden, foreign] = await MongoApp.create(
      ['Readable', 'Not requested', 'Forbidden', 'Other team'].map((name, index) => ({
        name,
        teamId: index === 3 ? outsider.teamId : owner.teamId,
        tmbId: index === 3 ? outsider.tmbId : owner.tmbId
      }))
    );
    await MongoResourcePermission.create(
      [readable, notRequested, foreign].map((app) => ({
        resourceType: PerResourceTypeEnum.app,
        teamId: app.teamId,
        resourceId: app._id,
        tmbId: member.tmbId,
        permission: ReadPermissionVal
      }))
    );
    const body = { appIds: [readable, forbidden, foreign].map((app) => String(app._id)) };
    const response = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: member, body }
    );

    expect(response.code).toBe(200);
    expect(response.data.total).toBe(1);
    expect(response.data.list.map((app) => String(app._id))).toEqual([String(readable._id)]);
    expect(response.data.list[0].permission).toMatchObject({ hasReadPer: true, isOwner: false });

    await MongoResourcePermission.deleteOne({
      resourceType: PerResourceTypeEnum.app,
      resourceId: readable._id,
      tmbId: member.tmbId
    });
    const revoked = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      { auth: member, body }
    );
    expect(revoked.code).toBe(200);
    expect(revoked.data).toEqual({ list: [], total: 0 });
  });

  it('保留类型、搜索、创建者和排除 ID 筛选', async () => {
    const { owner, members } = await getFakeUsers(1);
    const apps = await MongoApp.create(
      [
        { name: 'Match target' },
        { name: 'Match excluded' },
        { name: 'Match wrong type', type: AppTypeEnum.workflowTool },
        { name: 'Match wrong creator', tmbId: members[0].tmbId },
        { name: 'Other name' }
      ].map((app) => ({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        type: AppTypeEnum.workflow,
        ...app
      }))
    );
    const response = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      {
        auth: owner,
        body: {
          appIds: apps.map((app) => String(app._id)),
          type: [AppTypeEnum.workflow],
          searchKey: 'Match',
          tmbIds: [owner.tmbId],
          excludeAppId: String(apps[1]._id)
        }
      }
    );
    expect(response.code).toBe(200);
    expect(response.data.total).toBe(1);
    expect(response.data.list.map((app) => app.name)).toEqual(['Match target']);
  });

  it('不传 appIds 时保留目录范围和普通分页', async () => {
    const user = await getUser(`app-ids-empty-${getNanoid(6)}`);
    const apps = await MongoApp.create(
      [0, 1, 2].map((index) => ({
        name: `App ${index}`,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: index === 2 ? new Types.ObjectId() : null,
        updateTime: new Date(2026, 0, index + 1)
      }))
    );
    const response = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handler,
      {
        auth: user,
        body: {
          parentId: null,
          pageNum: 2,
          pageSize: 1,
          sort: AppListSortEnum.updateTimeDesc
        }
      }
    );
    expect(response.code).toBe(200);
    expect(response.data.total).toBe(2);
    expect(response.data.list.map((app) => String(app._id))).toEqual([String(apps[0]._id)]);
  });

  it('非法 appIds 在 API 边界被拒绝', async () => {
    const response = await Call(handler, { body: { appIds: ['invalid-id'] } });
    expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
  });

  it('无效 appIds 不会回退为分页查询', async () => {
    const response = await Call(handler, {
      body: { appIds: [], parentId: null, pageSize: 20 }
    });
    expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
  });
});
