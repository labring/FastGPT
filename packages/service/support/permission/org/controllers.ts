import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import type { ClientSession } from 'mongoose';
import { MongoOrgModel } from './orgSchema';
import { MongoOrgMemberModel } from './orgMemberSchema';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';

export const getOrgsByTmbId = async ({ teamId, tmbId }: { teamId: string; tmbId: string }) =>
  MongoOrgMemberModel.find({ teamId, tmbId }, 'orgId').lean();

export const getOrgIdSetWithParentByTmbId = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}) => {
  const orgMembers = await MongoOrgMemberModel.find({ teamId, tmbId }, 'orgId').lean();

  const orgIds = Array.from(new Set(orgMembers.map((item) => String(item.orgId))));
  const orgs = await MongoOrgModel.find({ _id: { $in: orgIds } }, 'path').lean();

  const pathIdList = new Set<string>(
    orgs
      .map((org) => {
        const pathIdList = org.path.split('/').filter(Boolean);
        return pathIdList;
      })
      .flat()
  );
  const parentOrgs = await MongoOrgModel.find(
    {
      teamId,
      pathId: { $in: Array.from(pathIdList) }
    },
    '_id'
  ).lean();
  const parentOrgIds = parentOrgs.map((item) => String(item._id));

  return new Set([...orgIds, ...parentOrgIds]);
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
    { session, ordered: true }
  );
}
