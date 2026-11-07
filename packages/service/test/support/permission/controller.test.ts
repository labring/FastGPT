import createAppAPI from '@/pages/api/core/app/create';
import { DEFAULT_ORG_AVATAR, DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import {
  getClbsInfo,
  getResourceOwnedClbs,
  getTmbPermissionMap
} from '@fastgpt/service/support/permission/controller';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getFakeGroups, getFakeOrgs, getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';
import type { CreateAppBodyType } from '@fastgpt/global/openapi/core/app/common/api';

describe('test getClbsWithInfo', () => {
  it('should treat a null parent resource id as an empty parent ACL', async () => {
    await expect(
      getResourceOwnedClbs({
        resourceType: PerResourceTypeEnum.app,
        resourceId: null,
        teamId: String(new Types.ObjectId())
      })
    ).resolves.toEqual([]);
  });

  it('should treat an empty parent resource id as an empty parent ACL', async () => {
    await expect(
      getResourceOwnedClbs({
        resourceType: PerResourceTypeEnum.app,
        resourceId: '',
        teamId: String(new Types.ObjectId())
      })
    ).resolves.toEqual([]);
  });

  it('should get ClbsWithInfo', async () => {
    // tmb, group, avatar
    // get name, avatar, default avatar fallback
    const users = await getFakeUsers(3);
    const orgs = await getFakeOrgs();
    const groups = await getFakeGroups(3);
    const app = await Call<CreateAppBodyType, Record<string, never>, string>(createAppAPI, {
      auth: users.owner,
      body: {
        nodes: [],
        name: 'test',
        type: AppTypeEnum.simple
      }
    });

    expect(app.data).toBeDefined();

    await MongoResourcePermission.create(
      users.members.map((member) => ({
        resourceId: app.data,
        permission: 4,
        resourceType: 'app',
        teamId: member.teamId,
        tmbId: member.tmbId
      }))
    );

    await MongoMemberGroupModel.updateOne(
      {
        _id: groups[0]._id
      },
      {
        avatar: 'test avatar'
      }
    );

    await MongoOrgModel.updateOne(
      {
        _id: orgs[0]._id
      },
      {
        avatar: 'test avatar'
      }
    );

    await MongoResourcePermission.create(
      groups.map((group) => ({
        resourceId: app.data,
        permission: 4,
        resourceType: 'app',
        teamId: group.teamId,
        groupId: group._id
      }))
    );

    await MongoResourcePermission.create(
      orgs.map((org) => ({
        resourceId: app.data,
        permission: 4,
        resourceType: 'app',
        teamId: org.teamId,
        orgId: org._id
      }))
    );

    const clbs = await getResourceOwnedClbs({
      resourceType: PerResourceTypeEnum.app,
      resourceId: String(app.data),
      teamId: users.manager.teamId
    });

    expect(clbs.length).eq(13); // 3 users, 3 groups, 6 orgs, 1 owner
    expect(clbs.filter((clb) => !!clb.tmbId).length).eq(4);
    expect(clbs.filter((clb) => !!clb.groupId).length).eq(3);
    expect(clbs.filter((clb) => !!clb.orgId).length).eq(6);

    const clbWithInfos = await getClbsInfo({
      clbs,
      teamId: users.manager.teamId,
      ownerTmbId: users.owner.tmbId,
      showUsername: true
    });

    expect(clbWithInfos.length).eq(13);
    expect(clbWithInfos.filter((clb) => !!clb.tmbId).length).eq(4);
    expect(clbWithInfos.filter((clb) => !!clb.groupId).length).eq(3);
    expect(clbWithInfos.filter((clb) => !!clb.orgId).length).eq(6);

    expect(clbWithInfos.map((clb) => clb.name).toSorted()).to.deep.equal(
      [
        'Member',
        'Member',
        'Member',
        'Owner',
        'group1',
        'group2',
        'group3',
        'org1',
        'org2',
        'org3',
        'org4',
        'org5',
        'root'
      ].toSorted()
    );

    expect(clbWithInfos.filter((clb) => clb.avatar === DEFAULT_ORG_AVATAR).length).eq(5);
    expect(clbWithInfos.filter((clb) => clb.avatar === DEFAULT_TEAM_AVATAR).length).eq(2);
    expect(clbWithInfos.filter((clb) => clb.avatar === 'test avatar').length).eq(2);

    // username: only team members expose it, using the user's login username
    const tmbClbs = clbWithInfos.filter((clb) => !!clb.tmbId);
    expect(tmbClbs.length).eq(4);
    expect(tmbClbs.filter((clb) => !!clb.username).length).eq(4);
    expect(tmbClbs.find((clb) => clb.name === 'Owner')?.username).eq('Owner');
    expect(
      tmbClbs
        .filter((clb) => clb.name === 'Member')
        .map((clb) => clb.username)
        .toSorted()
    ).deep.equal(['member1', 'member2', 'member3']);
    // groups and orgs have no username
    expect(
      clbWithInfos
        .filter((clb) => !!clb.groupId || !!clb.orgId)
        .every((clb) => clb.username === undefined)
    ).eq(true);

    expect(clbWithInfos.map((clb) => clb.permission.role).toSorted()).deep.equal(
      [...Array.from({ length: 12 }, () => 4), OwnerRoleVal].toSorted()
    );
  });
});

describe('test getClbsInfo edge cases', () => {
  it('should return empty list for empty clbs', async () => {
    const result = await getClbsInfo({
      clbs: [],
      teamId: '000000000000000000000000'
    });

    expect(result).deep.equal([]);
  });

  it('should return username undefined when the member user no longer exists', async () => {
    const users = await getFakeUsers(1);

    // team member pointing to a non-existent user (deleted/soft-deleted)
    const orphanTmb = await MongoTeamMember.create({
      teamId: users.owner.teamId,
      userId: new Types.ObjectId(),
      status: 'active'
    });

    const result = await getClbsInfo({
      clbs: [{ tmbId: String(orphanTmb._id), permission: OwnerRoleVal }],
      teamId: users.owner.teamId,
      showUsername: true
    });

    expect(result).length(1);
    expect(result[0].username).toBeUndefined(); // name/avatar still resolve from the team member
    expect(result[0].name).eq('Member');
    expect(result[0].avatar).toBeTruthy();
  });

  it('should normalize empty username to undefined', async () => {
    const users = await getFakeUsers(1);
    // username is required by the Mongoose schema, so bypass validation to
    // simulate a legacy document with an empty username
    const { insertedId } = await MongoUser.collection.insertOne({
      username: '',
      password: '123456'
    });
    const tmb = await MongoTeamMember.create({
      teamId: users.owner.teamId,
      userId: insertedId,
      status: 'active'
    });

    const result = await getClbsInfo({
      clbs: [{ tmbId: String(tmb._id), permission: OwnerRoleVal }],
      teamId: users.owner.teamId,
      showUsername: true
    });

    expect(result).length(1);
    expect(result[0].username).toBeUndefined();
  });

  it('should skip username resolution when showUsername is not set', async () => {
    const users = await getFakeUsers(1);

    const result = await getClbsInfo({
      clbs: [{ tmbId: users.owner.tmbId, permission: OwnerRoleVal }],
      teamId: users.owner.teamId
    });

    expect(result).length(1);
    expect(result[0].username).toBeUndefined();
    expect(result[0].name).eq('Owner'); // other fields still resolved
  });
});

describe('getTmbPermissionMap', () => {
  it('个人零权限优先，组/组织按位合并且拒绝越界资源或团队', async () => {
    const teamId = String(new Types.ObjectId());
    const tmbId = String(new Types.ObjectId());
    const groupId = String(new Types.ObjectId());
    const orgId = String(new Types.ObjectId());
    const ids = Array.from({ length: 3 }, () => String(new Types.ObjectId()));
    await MongoResourcePermission.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: ids[0],
        tmbId,
        permission: 0
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: ids[0],
        groupId,
        permission: OwnerRoleVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: ids[1],
        groupId,
        permission: ReadRoleVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: ids[1],
        orgId,
        permission: WriteRoleVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: ids[2],
        tmbId,
        permission: OwnerRoleVal
      },
      {
        teamId: String(new Types.ObjectId()),
        resourceType: PerResourceTypeEnum.collection,
        resourceId: ids[2],
        tmbId,
        permission: OwnerRoleVal
      }
    ]);
    const permissions = await getTmbPermissionMap({
      teamId,
      tmbId,
      resourceType: PerResourceTypeEnum.collection,
      resourceIds: [...ids, ids[0]],
      groupIds: [groupId],
      orgIds: [orgId]
    });
    expect(permissions.size).toBe(3);
    expect(permissions.get(ids[0])).toBe(0);
    expect(permissions.get(ids[1])).toBe(ReadRoleVal | WriteRoleVal);
    expect(permissions.get(ids[2])).toBe(0);
    expect(
      await getTmbPermissionMap({
        teamId,
        tmbId,
        resourceType: PerResourceTypeEnum.collection,
        resourceIds: [],
        groupIds: [],
        orgIds: []
      })
    ).toEqual(new Map());
  });
});
