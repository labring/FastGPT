import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import type { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { type AuthModeType, type AuthResponseType } from '../type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { parseHeaderCert } from '../auth/common';
import { groupRepository, type TransactionContext } from '../../../common/dal';

const toLegacyGroup = (
  group: NonNullable<Awaited<ReturnType<typeof groupRepository.findMemberGroupByTeamAndName>>>
) => ({
  _id: group.id,
  teamId: group.teamId,
  name: group.name,
  avatar: group.avatar,
  updateTime: group.updateTime
});

/**
 * Get the default group of a team
 * @param{Object} obj
 * @param{string} obj.teamId
 * @param{TransactionContext} obj.context
 */
export const getTeamDefaultGroup = async ({
  teamId,
  context
}: {
  teamId: string;
  context?: TransactionContext;
}) => {
  const group = await groupRepository.findMemberGroupByTeamAndName(
    teamId,
    DefaultGroupName,
    context
  );
  if (group) return toLegacyGroup(group);

  return toLegacyGroup(
    await groupRepository.createMemberGroup({ teamId, name: DefaultGroupName }, context)
  );
};

export const getGroupsByTmbId = async ({
  tmbId,
  teamId,
  role,
  context
}: {
  tmbId: string;
  teamId: string;
  role?: `${GroupMemberRole}`[];
  context?: TransactionContext;
}) => [
  ...(await groupRepository.findGroupsByTmbId(teamId, tmbId, role, context)).map((group) =>
    toLegacyGroup(group)
  ),
  ...(role
    ? []
    : await getTeamDefaultGroup({ teamId, context }).then((group) => (group ? [group] : [])))
];

export const getGroupMembersByGroupId = async (groupId: string) => {
  const members = await groupRepository.findGroupMembersByGroupId(groupId);
  return members.map((member) => ({
    _id: member.id,
    groupId: member.groupId,
    tmbId: member.tmbId,
    role: member.role
  }));
};

// auth group member role
export const authGroupMemberRole = async ({
  groupId,
  role,
  ...props
}: {
  groupId: string;
  role: `${GroupMemberRole}`[];
} & AuthModeType): Promise<AuthResponseType> => {
  const result = await parseHeaderCert(props);
  const { teamId, tmbId, isRoot } = result;
  if (isRoot) {
    return {
      ...result,
      permission: new TeamPermission({
        isOwner: true
      }),
      teamId,
      tmbId
    };
  }
  const [groupMember, tmb] = await Promise.all([
    groupRepository.findGroupMember(groupId, tmbId),
    getTmbInfoByTmbId({ tmbId })
  ]);

  // Team admin or role check
  if (tmb.permission.hasManagePer || (groupMember && role.includes(groupMember.role))) {
    return {
      ...result,
      permission: tmb.permission,
      teamId,
      tmbId
    };
  }
  return Promise.reject(TeamErrEnum.unAuthTeam);
};
