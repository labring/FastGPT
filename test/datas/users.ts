import { AuthUserTypeEnum, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { MemberGroupSchemaType } from '@fastgpt/global/support/permission/memberGroup/type';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import { OrgType } from '@fastgpt/global/support/user/team/org/type';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import type { parseHeaderCertRet } from 'test/mocks/request';

export async function getRootUser(): Promise<parseHeaderCertRet> {
  const rootUser = await MongoUser.create({
    username: 'root',
    password: '123456'
  });

  const team = await MongoTeam.create({
    name: 'test team',
    ownerId: rootUser._id
  });

  // Initialize free subscription plan for the team
  await initTeamFreePlan({
    teamId: String(team._id)
  });

  const tmb = await MongoTeamMember.create({
    teamId: team._id,
    userId: rootUser._id,
    status: 'active'
  });

  return {
    userId: rootUser._id,
    apikey: '',
    appId: '',
    authType: AuthUserTypeEnum.token,
    isRoot: true,
    sourceName: undefined,
    teamId: tmb?.teamId,
    tmbId: tmb?._id,
    sessionId: ''
  };
}

export async function getUser(username: string, teamId?: string): Promise<parseHeaderCertRet> {
  const user = await MongoUser.create({
    username,
    password: '123456'
  });

  const tmb = await (async () => {
    if (!teamId) {
      const team = await MongoTeam.create({
        name: username,
        ownerId: user._id
      });

      // Initialize free subscription plan for the team
      await initTeamFreePlan({
        teamId: String(team._id)
      });

      const tmb = await MongoTeamMember.create({
        name: username,
        teamId: team._id,
        userId: user._id,
        status: 'active',
        role: 'owner'
      });

      await MongoMemberGroupModel.create({
        teamId: team._id,
        name: DefaultGroupName,
        avatar: team.avatar
      });

      return tmb;
    }
    return MongoTeamMember.create({
      teamId,
      userId: user._id,
      status: 'active'
    });
  })();

  return {
    userId: String(user._id),
    apikey: '',
    appId: '',
    authType: AuthUserTypeEnum.token,
    isRoot: false,
    sourceName: undefined,
    teamId: String(tmb?.teamId),
    tmbId: String(tmb?._id),
    sessionId: ''
  };
}

let fakeUsers: Record<string, parseHeaderCertRet> = {};

async function getFakeUser(username: string) {
  if (username === 'Owner') {
    if (!fakeUsers[username]) {
      fakeUsers[username] = await getUser(username);
    }
    return fakeUsers[username];
  }

  const owner = await getFakeUser('Owner');
  const ownerTeamId = owner.teamId;
  if (!fakeUsers[username]) {
    fakeUsers[username] = await getUser(username, ownerTeamId);
  }
  return fakeUsers[username];
}

async function addPermission({
  user,
  permission
}: {
  user: parseHeaderCertRet;
  permission: PermissionValueType;
}) {
  const { teamId, tmbId } = user;
  await MongoResourcePermission.updateOne({
    resourceType: PerResourceTypeEnum.team,
    teamId,
    resourceId: null,
    tmbId,
    permission
  });
}

export async function getFakeUsers(num: number = 10) {
  const owner = await getFakeUser('Owner');
  const manager = await getFakeUser('Manager');
  await MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.team,
    teamId: owner.teamId,
    resourceId: null,
    tmbId: manager.tmbId,
    permission: TeamManagePermissionVal
  });
  const members = (await Promise.all(
    Array.from({ length: num }, (_, i) => `member${i + 1}`) // 团队 member1, member2, ..., member10
      .map((username) => getFakeUser(username))
  )) as parseHeaderCertRet[];
  return {
    owner,
    manager,
    members
  };
}

export async function getFakeGroups(num: number = 5) {
  // create 5 groups
  const teamId = (await getFakeUser('Owner')).teamId;
  return MongoMemberGroupModel.create(
    [...Array(num).keys()].map((i) => ({
      name: `group${i + 1}`,
      teamId
    }))
  ) as Promise<MemberGroupSchemaType[]>;
}

export async function getFakeOrgs() {
  // create 5 orgs
  const pathIds = ['root', 'org1', 'org2', 'org3', 'org4', 'org5'];
  const paths = ['', '/root', '/root', '/root', '/root/org1', '/root/org1/org4'];
  const teamId = (await getFakeUser('Owner')).teamId;
  return MongoOrgModel.create(
    pathIds.map((pathId, i) => ({
      pathId,
      name: pathId,
      path: paths[i],
      teamId
    }))
  ) as Promise<OrgSchemaType[]>;
}

export async function clean() {
  fakeUsers = {};
}
