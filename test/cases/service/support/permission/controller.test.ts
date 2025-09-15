import type { CreateAppBody } from '@/pages/api/core/app/create';
import createAppAPI from '@/pages/api/core/app/create';
import { DEFAULT_ORG_AVATAR, DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getClbsInfo, getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeGroups, getFakeOrgs, getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('test getClbsWithInfo', () => {
  it('should get ClbsWithInfo', async () => {
    // tmb, group, avatar
    // get name, avatar, default avatar fallback
    const users = await getFakeUsers(3);
    const orgs = await getFakeOrgs();
    const groups = await getFakeGroups(3);
    const app = await Call<CreateAppBody, {}, string>(createAppAPI, {
      auth: users.owner,
      body: {
        modules: [],
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
      ownerTmbId: users.owner.tmbId
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

    expect(clbWithInfos.map((clb) => clb.permission.role).toSorted()).deep.equal(
      [...Array.from({ length: 12 }, () => 4), OwnerRoleVal].toSorted()
    );
  });
});
