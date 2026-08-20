import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import { orgRepository, type TransactionContext } from '../../../common/dal';

const toLegacyOrg = (org: NonNullable<Awaited<ReturnType<typeof orgRepository.findOrgById>>>) => ({
  _id: org.id,
  teamId: org.teamId,
  pathId: org.pathId,
  path: org.path,
  name: org.name,
  avatar: org.avatar,
  description: org.description,
  updateTime: org.updateTime
});

export const getOrgsByTmbId = async ({ teamId, tmbId }: { teamId: string; tmbId: string }) =>
  (await orgRepository.findOrgMembersByTmbId(teamId, tmbId)).map((member) => ({
    _id: member.orgId,
    orgId: member.orgId
  }));

export const getOrgIdSetWithParentByTmbId = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}) => {
  const orgMembers = await orgRepository.findOrgMembersByTmbId(teamId, tmbId);

  const orgIds = Array.from(new Set(orgMembers.map((item) => item.orgId)));
  const orgs = await orgRepository.findOrgsByIds(orgIds);

  const pathIdList = new Set<string>(
    orgs
      .map((org) => {
        const pathIdList = org.path.split('/').filter(Boolean);
        return pathIdList;
      })
      .flat()
  );
  const parentOrgs = await orgRepository.findOrgsByTeamAndPathIds(teamId, Array.from(pathIdList));
  const parentOrgIds = parentOrgs.map((item) => item.id);

  return new Set([...orgIds, ...parentOrgIds]);
};

export const getChildrenByOrg = async ({
  org,
  teamId,
  context
}: {
  org: OrgSchemaType;
  teamId: string;
  context?: TransactionContext;
}) => {
  return (await orgRepository.findOrgChildren(org, teamId, context)).map((item) => ({
    _id: item.id,
    teamId: item.teamId,
    pathId: item.pathId,
    path: item.path,
    name: item.name,
    avatar: item.avatar,
    description: item.description,
    updateTime: item.updateTime
  }));
};

export const getOrgAndChildren = async ({
  orgId,
  teamId,
  context
}: {
  orgId: string;
  teamId: string;
  context?: TransactionContext;
}) => {
  const org = await orgRepository.findOrgById(orgId, teamId, context);
  if (!org) {
    return Promise.reject(TeamErrEnum.orgNotExist);
  }
  const children = await orgRepository.findOrgChildren(org, teamId, context);
  return { org: toLegacyOrg(org), children: children.map(toLegacyOrg) };
};

export async function createRootOrg({
  teamId,
  context
}: {
  teamId: string;
  context?: TransactionContext;
}) {
  const org = await orgRepository.createOrg({ teamId, name: 'ROOT', path: '' }, context);
  return [toLegacyOrg(org)];
}
