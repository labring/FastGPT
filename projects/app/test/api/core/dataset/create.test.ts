import createHandler from '@/pages/api/core/dataset/create';
import type {
  CreateDatasetBody,
  CreateDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect } from 'vitest';

describe('create dataset', () => {
  it('should return 200 when create dataset success', async () => {
    const users = await getFakeUsers(2);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamDatasetCreatePermissionVal
    });
    const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: users.members[0],
        body: {
          name: 'folder',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.folder
        }
      }
    );
    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    const folderId = res.data as string;

    const res2 = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: users.members[0],
        body: {
          name: 'test',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.dataset,
          parentId: folderId
        }
      }
    );

    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);
  });

  it('should create dataset with inheritPermission=false → owner-only snapshot, default → merged snapshot', async () => {
    const users = await getFakeUsers(2);
    const creator = users.members[0];
    const reader = users.members[1];
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.team,
      teamId: creator.teamId,
      resourceId: null,
      tmbId: creator.tmbId,
      permission: TeamDatasetCreatePermissionVal
    });

    // 父级 folder（dataset 类型）
    const folderRes = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: creator,
        body: {
          name: 'parent',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.folder
        }
      }
    );
    expect(folderRes.code).toBe(200);
    const folderId = folderRes.data as string;

    // 给父级 folder 的物化快照加一个 reader 协作者（模拟父级已有协作者配置）
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: creator.teamId,
      resourceId: folderId,
      tmbId: reader.tmbId,
      permission: ReadRoleVal
    });

    // 独立态创建（inheritPermission=false）：仅 owner 快照，不合并父级
    const independentRes = await Call<
      CreateDatasetBody,
      Record<string, never>,
      CreateDatasetResponse
    >(createHandler, {
      auth: creator,
      body: {
        name: 'independent',
        intro: 'intro',
        avatar: 'avatar',
        type: DatasetTypeEnum.dataset,
        parentId: folderId,
        inheritPermission: false
      }
    });
    expect(independentRes.code).toBe(200);
    const independentId = independentRes.data as string;

    const independentDoc = await MongoDataset.findById(independentId).lean();
    expect(independentDoc?.inheritPermission).toBe(false);
    const independentClbs = await MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: creator.teamId,
      resourceId: independentId
    }).lean();
    const independentMap = new Map(
      independentClbs.map((c) => [String(c.tmbId), c.permission] as const)
    );
    expect(independentMap).toEqual(new Map([[String(creator.tmbId), OwnerRoleVal]])); // reader 未继承
    expect(independentMap.has(String(reader.tmbId))).toBe(false);

    // 继承态创建（默认）：快照 = merge(父级有效 clbs, [owner])，reader 继承自父级
    const inheritRes = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: creator,
        body: {
          name: 'inherit',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.dataset,
          parentId: folderId
        }
      }
    );
    expect(inheritRes.code).toBe(200);
    const inheritId = inheritRes.data as string;

    const inheritDoc = await MongoDataset.findById(inheritId).lean();
    expect(inheritDoc?.inheritPermission).toBe(true);
    const inheritClbs = await MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: creator.teamId,
      resourceId: inheritId
    }).lean();
    const inheritMap = new Map(inheritClbs.map((c) => [String(c.tmbId), c.permission] as const));
    expect(inheritMap.get(String(creator.tmbId))).toBe(OwnerRoleVal);
    expect(inheritMap.get(String(reader.tmbId))).toBe(ReadRoleVal);
  });
});
