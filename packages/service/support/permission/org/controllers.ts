import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import type { ClientSession } from 'mongoose';
import { MongoOrgModel } from './orgSchema';
import { MongoOrgMemberModel } from './orgMemberSchema';

// if role1 > role2, return 1
// if role1 < role2, return -1
// else return 0
// export const compareRole = (role1: OrgMemberRole, role2: OrgMemberRole) => {
//   if (role1 === OrgMemberRole.owner) {
//     if (role2 === OrgMemberRole.owner) {
//       return 0;
//     }
//     return 1;
//   }
//   if (role2 === OrgMemberRole.owner) {
//     return -1;
//   }
//   if (role1 === OrgMemberRole.admin) {
//     if (role2 === OrgMemberRole.admin) {
//       return 0;
//     }
//     return 1;
//   }
//   if (role2 === OrgMemberRole.admin) {
//     return -1;
//   }
//   return 0;
// };

// export const checkOrgRole = (role: OrgMemberRole, targetRole: OrgMemberRole) => {
//   return compareRole(role, targetRole) >= 0;
// };

export const getOrgsByTmbId = async ({ teamId, tmbId }: { teamId: string; tmbId: string }) =>
  MongoOrgMemberModel.find({ teamId, tmbId }, 'orgId').lean();

export const getOrgsWithParentByTmbId = async ({ teamId, tmbId }: { teamId: string; tmbId: string }) =>
  MongoOrgMemberModel.find({ teamId, tmbId }, 'orgId').lean().then((orgs) => {
    const orgIds = new Set<string>();
    for (const org of orgs) {
      const orgId = String(org.orgId);
      const parentIds = orgId.split('/').filter((id) => id);
      for (const parentId of parentIds) {
        orgIds.add(parentId);
      }
    }
    return orgIds;
  });

export const getChildrenByOrg = async ({
  org,
  teamId,
  session
}: {
  org: OrgSchemaType;
  teamId: string;
  session?: ClientSession;
}) => {
  const children = await MongoOrgModel.find(
    { teamId, path: { $regex: `^${org.path}/${org._id}` } },
    undefined,
    {
      session
    }
  ).lean();
  return children;
};

export const getOrgAndChildren = async ({
  orgId,
  teamId,
  session
}: {
  orgId: string;
  teamId: string;
  session?: ClientSession;
}) => {
  const org = await MongoOrgModel.findOne({ _id: orgId, teamId }, undefined, { session }).lean();
  if (!org) {
    return Promise.reject(TeamErrEnum.orgNotExist);
  }
  const children = await getChildrenByOrg({ org, teamId, session });
  return { org, children };
};

export async function createRootOrg({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}) {
  // Create the root org
  const [org] = await MongoOrgModel.create(
    [
      {
        teamId,
        name: 'ROOT',
        path: ''
      }
    ],
    { session }
  );
  // Find the team's owner
  // const owner = await MongoTeamMember.findOne({ teamId, role: 'owner' }, undefined);
  // if (!owner) {
  //   return Promise.reject(TeamErrEnum.unAuthTeam);
  // }

  // Set the owner as the org admin
  // await MongoOrgMemberModel.create(
  //   [
  //     {
  //       orgId: org._id,
  //       tmbId: owner._id

  //     }
  //   ],
  //   { session }
  // );
}

// export const getOrgMemberRole = async ({
//   orgId,
//   tmbId
// }: {
//   orgId: string;
//   tmbId: string;
// }): Promise<OrgMemberRole | undefined> => {
//   let role: OrgMemberRole | undefined;
//   const orgMember = await MongoOrgMemberModel.findOne({
//     orgId,
//     tmbId
//   })
//     .populate('orgId')
//     .lean();
//   if (orgMember) {
//     role = OrgMemberRole[orgMember.role];
//   } else {
//     return role;
//   }
//   if (role === OrgMemberRole.owner) {
//     return role;
//   }
//   // Check the parent orgs
//   const org = orgMember.orgId as unknown as OrgSchemaType;
//   if (!org) {
//     return Promise.reject(TeamErrEnum.orgNotExist);
//   }
//   const parentIds = org.path.split('/').filter((id) => id);
//   if (parentIds.length === 0) {
//     return role;
//   }
//   const parentOrgMembers = await MongoOrgMemberModel.find({
//     orgId: {
//       $in: parentIds
//     },
//     tmbId
//   }).lean();
//   // Update the role to the highest role
//   for (const parentOrgMember of parentOrgMembers) {
//     const parentRole = OrgMemberRole[parentOrgMember.role];
//     if (parentRole === OrgMemberRole.owner) {
//       role = parentRole;
//       break;
//     }
//     if (parentRole === OrgMemberRole.admin && role === OrgMemberRole.member) {
//       role = parentRole;
//     }
//   }
//   return role;
// };
