import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import type { ClientSession } from 'mongoose';
import { MongoOrgModel } from './orgSchema';
import { MongoOrgMemberModel } from './orgMemberSchema';
import { getChildrenPath } from '@fastgpt/global/support/user/team/org/constant';

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
  return MongoOrgModel.find({ teamId, path: { $regex: `^${getChildrenPath(org)}` } }, undefined, {
    session
  }).lean();
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
