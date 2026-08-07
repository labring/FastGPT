import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { getUser } from '@test/datas/users';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import {
  ReadRoleVal,
  WriteRoleVal,
  ManageRoleVal,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import {
  getMyResourcePermission,
  buildReadableMatch,
  mergeMongoAndQuery,
  addSourceMemberV2
} from '@fastgpt/service/support/permission/resource/readable';

const createPermission = (role?: number) => new AppPermission({ role });

describe('buildReadableMatch', () => {
  it('三分支：直接可读 / 创建者 / 一层继承（排除文件夹）', () => {
    const match = buildReadableMatch({
      readableDirectIds: ['a', 'b'],
      tmbId: 'me',
      folderTypeList: ['folder']
    });
    expect(match).toEqual({
      $or: [
        { _id: { $in: ['a', 'b'] } },
        { tmbId: 'me' },
        {
          type: { $nin: ['folder'] },
          inheritPermission: true,
          parentId: { $in: ['a', 'b'] }
        }
      ]
    });
  });
});

describe('mergeMongoAndQuery', () => {
  it('空对象被忽略；单条件直接返回；多条件（含多个 $or）用 $and 合并避免覆盖', () => {
    expect(mergeMongoAndQuery({})).toEqual({});
    expect(mergeMongoAndQuery({ a: 1 }, {})).toEqual({ a: 1 });
    expect(mergeMongoAndQuery({ teamId: 't' }, { $or: [{ x: 1 }] }, { $or: [{ y: 2 }] })).toEqual({
      $and: [{ teamId: 't' }, { $or: [{ x: 1 }] }, { $or: [{ y: 2 }] }]
    });
  });
});

describe('getMyResourcePermission（真实 DB）', () => {
  it('tmb 直授 read → readableDirectIds 含；anyRecordedIds 含 permission=0 记录', async () => {
    const user = await getUser(`readable-tmb-${getNanoid(6)}`);
    const readAppId = new Types.ObjectId();
    const zeroAppId = new Types.ObjectId();

    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: user.teamId,
        resourceId: readAppId,
        tmbId: user.tmbId,
        permission: ReadRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: user.teamId,
        resourceId: zeroAppId,
        tmbId: user.tmbId,
        permission: 0
      }
    ]);

    const result = await getMyResourcePermission({
      teamId: user.teamId,
      tmbId: user.tmbId,
      resourceType: PerResourceTypeEnum.app,
      createPermission
    });

    expect(result.readableDirectIds).toContain(String(readAppId));
    // permission=0 的记录存在但不可读（tmb 直授 0 不回落组角色，?? 语义）
    expect(result.readableDirectIds).not.toContain(String(zeroAppId));
    // 但 anyRecordedIds 记录的是「出现过记录」，含 permission=0
    expect(result.anyRecordedIds).toContain(String(zeroAppId));
    expect(result.anyRecordedIds).toContain(String(readAppId));
  });

  it('个人直授优先：tmb write 压过组 manage（?? 语义，非 ||）', async () => {
    const user = await getUser(`readable-priority-${getNanoid(6)}`);
    const appId = new Types.ObjectId();

    const group = await MongoMemberGroupModel.create({
      teamId: user.teamId,
      name: 'g'
    });
    await MongoGroupMemberModel.create({
      groupId: group._id,
      tmbId: user.tmbId
    });
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: user.teamId,
        resourceId: appId,
        tmbId: user.tmbId,
        permission: WriteRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: user.teamId,
        resourceId: appId,
        groupId: group._id,
        permission: ManageRoleVal
      }
    ]);

    const result = await getMyResourcePermission({
      teamId: user.teamId,
      tmbId: user.tmbId,
      resourceType: PerResourceTypeEnum.app,
      createPermission
    });

    expect(result.readableDirectIds).toContain(String(appId));
  });

  it('个人直授 permission=0 压过组 read（0 不回落）', async () => {
    const user = await getUser(`readable-zero-${getNanoid(6)}`);
    const appId = new Types.ObjectId();

    const group = await MongoMemberGroupModel.create({
      teamId: user.teamId,
      name: 'g'
    });
    await MongoGroupMemberModel.create({
      groupId: group._id,
      tmbId: user.tmbId
    });
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: user.teamId,
        resourceId: appId,
        tmbId: user.tmbId,
        permission: 0
      },
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: user.teamId,
        resourceId: appId,
        groupId: group._id,
        permission: ReadRoleVal
      }
    ]);

    const result = await getMyResourcePermission({
      teamId: user.teamId,
      tmbId: user.tmbId,
      resourceType: PerResourceTypeEnum.app,
      createPermission
    });

    // ?? 语义：tmb 记录存在（permission=0）时不回落组角色 → 不可读
    expect(result.readableDirectIds).not.toContain(String(appId));
    expect(result.anyRecordedIds).toContain(String(appId));
  });

  it('组授权 read（组集合展开）→ 可读', async () => {
    const user = await getUser(`readable-group-${getNanoid(6)}`);
    const appId = new Types.ObjectId();

    const group = await MongoMemberGroupModel.create({
      teamId: user.teamId,
      name: 'g'
    });
    await MongoGroupMemberModel.create({
      groupId: group._id,
      tmbId: user.tmbId
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: user.teamId,
      resourceId: appId,
      groupId: group._id,
      permission: ReadRoleVal
    });

    const result = await getMyResourcePermission({
      teamId: user.teamId,
      tmbId: user.tmbId,
      resourceType: PerResourceTypeEnum.app,
      createPermission
    });

    expect(result.readableDirectIds).toContain(String(appId));
  });

  it('组织授权 read（组织含父级路径展开）→ 可读', async () => {
    const user = await getUser(`readable-org-${getNanoid(6)}`);
    const appId = new Types.ObjectId();

    const org = await MongoOrgModel.create({
      teamId: user.teamId,
      pathId: `path-${getNanoid(6)}`,
      path: '/',
      name: 'org'
    });
    await MongoOrgMemberModel.create({
      teamId: user.teamId,
      orgId: org._id,
      tmbId: user.tmbId
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: user.teamId,
      resourceId: appId,
      orgId: org._id,
      permission: ReadRoleVal
    });

    const result = await getMyResourcePermission({
      teamId: user.teamId,
      tmbId: user.tmbId,
      resourceType: PerResourceTypeEnum.app,
      createPermission
    });

    expect(result.readableDirectIds).toContain(String(appId));
  });

  it('OwnerRoleVal 记录 → 可读', async () => {
    const user = await getUser(`readable-owner-${getNanoid(6)}`);
    const appId = new Types.ObjectId();

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: user.teamId,
      resourceId: appId,
      tmbId: user.tmbId,
      permission: OwnerRoleVal
    });

    const result = await getMyResourcePermission({
      teamId: user.teamId,
      tmbId: user.tmbId,
      resourceType: PerResourceTypeEnum.app,
      createPermission
    });

    expect(result.readableDirectIds).toContain(String(appId));
  });
});

describe('addSourceMemberV2（缺成员占位不丢项）', () => {
  it('正常成员返回真实 sourceMember', async () => {
    const user = await getUser(`sourcemember-ok-${getNanoid(6)}`);
    const list = await addSourceMemberV2({ list: [{ _id: 'x', tmbId: user.tmbId }] });
    expect(list[0].sourceMember.name).toBeDefined();
    expect(list[0].sourceMember.status).not.toBeNull();
  });

  it('缺成员（tmbId 不存在）保留资源 + 占位（status null，不作虚假陈述）', async () => {
    const list = await addSourceMemberV2({
      list: [{ _id: 'x', tmbId: new Types.ObjectId().toString() }]
    });
    expect(list).toHaveLength(1);
    expect(list[0].sourceMember).toEqual({
      name: '未知成员',
      avatar: null,
      status: null
    });
  });

  it('tmbId 为 null（system skill）保留资源 + 占位', async () => {
    const list = await addSourceMemberV2({ list: [{ _id: 'x', tmbId: null }] });
    expect(list).toHaveLength(1);
    expect(list[0].sourceMember.status).toBeNull();
  });
});
