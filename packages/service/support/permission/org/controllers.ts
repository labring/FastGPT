import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import type { ClientSession } from 'mongoose';
import { MongoOrgModel } from './orgSchema';
import { MongoOrgMemberModel } from './orgMemberSchema';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { MongoResourcePermission } from '../schema';

export const getOrgsByTmbId = async ({ teamId, tmbId }: { teamId: string; tmbId: string }) =>
  MongoOrgMemberModel.find({ teamId, tmbId }, 'orgId').lean();

export const getOrgIdSetWithParentByTmbId = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}) => {
  const orgMembers = await MongoOrgMemberModel.find({ teamId, tmbId }, 'orgId')
    .populate<{ org: { path: string } }>('org', 'path')
    .lean();

  const orgIds = new Set<string>();

  for (const orgMember of orgMembers) {
    orgIds.add(String(orgMember.orgId));

    // Add parent org
    const parentIds = orgMember.org.path.split('/').filter(Boolean);
    for (const parentId of parentIds) {
      orgIds.add(parentId);
    }
  }

  return orgIds;
};

export const getChildrenByOrg = async ({
  org,
  teamId,
  session
}: {
  org: OrgSchemaType;
  teamId: string;
  session?: ClientSession;
}) => {
  return MongoOrgModel.find(
    { teamId, path: { $regex: `^${getOrgChildrenPath(org)}` } },
    undefined,
    {
      session
    }
  ).lean();
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
  return MongoOrgModel.create(
    [
      {
        teamId,
        name: 'ROOT',
        path: ''
      }
    ],
    { session }
  );
}

/** Sync the Org */
export type syncOrgParams = {
  teamId: string;
  orgs: {
    pathId: string; // this should be unique
    path: string; // "org1/org2/org3/pathid"
    name: string;
    tmbIds: string[];
  }[];
  session?: ClientSession;
};

export async function syncOrg({ teamId, orgs, session }: syncOrgParams) {
  const permissions = await MongoResourcePermission.find(
    {
      teamId,
      orgId: {
        $exists: true
      }
    },
    undefined,
    { session }
  ).lean();

  const oldOrgs = await MongoOrgModel.find({ teamId }, undefined, { session });
  const pathId_oldOrgMap = new Map<string, string>();

  oldOrgs.forEach((org) => {
    pathId_oldOrgMap.set(String(org.pathId), String(org._id));
  });

  // 2. Delete all orgs of a team
  await Promise.all([
    MongoOrgModel.deleteMany({ teamId }, { session }),
    MongoOrgMemberModel.deleteMany({ teamId }, { session }),
    MongoResourcePermission.deleteMany(
      {
        teamId,
        orgId: {
          $exists: true
        }
      },
      { session }
    )
  ]);

  // 3. create new orgs
  for (const org of orgs) {
    // 3.1 create new orgs
    const [newOrg] = await MongoOrgModel.create(
      [
        {
          teamId,
          name: org.name,
          pathId: org.pathId,
          path: org.path
        }
      ],
      { session }
    );
    // 3.2 add members
    for (const tmbId of org.tmbIds) {
      await MongoOrgMemberModel.create(
        [
          {
            teamId,
            orgId: newOrg._id,
            tmbId
          }
        ],
        { session }
      );
    }

    const pers = permissions.filter((p) => {
      if (!p.orgId) return;
      const oldOrgId = pathId_oldOrgMap.get(String(org.pathId));
      if (String(p.orgId) === String(oldOrgId)) {
        return true;
      }
      return false;
    });

    // 3.3 add resource Permissions
    await MongoResourcePermission.create(
      pers.map((per) => ({
        teamId,
        orgId: newOrg._id,
        permission: per.permission,
        resourceType: per.resourceType,
        resourceId: per.resourceId
      })),
      { session }
    );
  }
}
