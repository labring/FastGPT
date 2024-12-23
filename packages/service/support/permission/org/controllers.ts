import { MongoOrgMemberModel } from './orgMemberSchema';
import { MongoOrgModel } from './orgSchema';
import { OrgMemberRole } from '@fastgpt/global/support/user/team/org/constant';
import type { AuthModeType, AuthResponseType } from '../type';
import { parseHeaderCert } from '../controller';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { ClientSession } from 'mongoose';

// if role1 > role2, return 1
// if role1 < role2, return -1
// else return 0
export const compareRole = (role1: OrgMemberRole, role2: OrgMemberRole) => {
  if (role1 === OrgMemberRole.owner) {
    if (role2 === OrgMemberRole.owner) {
      return 0;
    }
    return 1;
  }
  if (role2 === OrgMemberRole.owner) {
    return -1;
  }
  if (role1 === OrgMemberRole.admin) {
    if (role2 === OrgMemberRole.admin) {
      return 0;
    }
    return 1;
  }
  if (role2 === OrgMemberRole.admin) {
    return -1;
  }
  return 0;
};

export const checkOrgRole = (role: OrgMemberRole, targetRole: OrgMemberRole) => {
  return compareRole(role, targetRole) >= 0;
};

export const getOrgsByTeamId = async (teamId: string) => {
  const orgs = await MongoOrgModel.find({
    teamId
  })
    .populate('members')
    .lean();

  return orgs;
};

export const getOrgAndChildren = async ({
  orgId,
  session
}: {
  orgId: string;
  session?: ClientSession;
}) => {
  const org = await MongoOrgModel.findById(orgId, undefined, { session }).lean();
  if (!org) {
    return Promise.reject(TeamErrEnum.orgNotExist);
  }
  const children = await MongoOrgModel.find(
    {
      path: {
        $regex: `^${org.path}/${org._id}`
      }
    },
    undefined,
    { session }
  ).lean();
  return { org, children };
};

export const getOrgMemberRole = async ({
  orgId,
  tmbId
}: {
  orgId: string;
  tmbId: string;
}): Promise<OrgMemberRole | undefined> => {
  let role: OrgMemberRole | undefined;
  const orgMember = await MongoOrgMemberModel.findOne({
    orgId,
    tmbId
  })
    .populate('orgId')
    .lean();
  if (orgMember) {
    role = OrgMemberRole[orgMember.role];
  } else {
    return role;
  }
  if (role == OrgMemberRole.owner) {
    return role;
  }
  // Check the parent orgs
  const org = orgMember.orgId as unknown as OrgSchemaType;
  if (!org) {
    return Promise.reject(TeamErrEnum.orgNotExist);
  }
  const parentIds = org.path.split('/').filter((id) => id);
  if (parentIds.length === 0) {
    return role;
  }
  const parentOrgMembers = await MongoOrgMemberModel.find({
    orgId: {
      $in: parentIds
    },
    tmbId
  }).lean();
  // Update the role to the highest role
  for (const parentOrgMember of parentOrgMembers) {
    const parentRole = OrgMemberRole[parentOrgMember.role];
    if (parentRole === OrgMemberRole.owner) {
      role = parentRole;
      break;
    } else if (parentRole === OrgMemberRole.admin && role === OrgMemberRole.member) {
      role = parentRole;
    }
  }
  return role;
};

export const authOrgMember = async ({
  orgIds,
  role,
  req,
  authToken = false,
  authRoot = false,
  authApiKey = false
}: {
  orgIds: string | string[];
  role: `${OrgMemberRole}` | OrgMemberRole;
} & AuthModeType): Promise<AuthResponseType> => {
  const result = await parseHeaderCert({ req, authToken, authApiKey, authRoot });
  const { teamId, tmbId, isRoot } = result;
  if (isRoot) {
    return {
      teamId,
      tmbId,
      userId: result.userId,
      appId: result.appId,
      apikey: result.apikey,
      isRoot,
      authType: result.authType,
      permission: new TeamPermission({ isOwner: true })
    };
  }

  if (!Array.isArray(orgIds)) {
    orgIds = [orgIds];
  }
  const promises = orgIds.map((orgId) => getOrgMemberRole({ orgId, tmbId }));

  const [tmb, ...orgRoles] = await Promise.all([getTmbInfoByTmbId({ tmbId }), ...promises]);
  if (tmb.permission.hasManagePer) {
    return {
      ...result,
      permission: tmb.permission
    };
  }

  const targetRole = OrgMemberRole[role];
  for (const orgRole of orgRoles) {
    if (!orgRole || checkOrgRole(orgRole, targetRole)) {
      return Promise.reject(TeamErrEnum.unAuthTeam);
    }
  }

  return {
    ...result,
    permission: tmb.permission
  };
};
