import { type MemberGroupSchemaType } from '@fastgpt/global/support/permission/memberGroup/type';
import { MongoGroupMemberModel } from './groupMemberSchema';
import { MongoMemberGroupModel } from './memberGroupSchema';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { type ClientSession } from 'mongoose';
import type { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { type AuthModeType, type AuthResponseType } from '../type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { parseHeaderCert } from '../auth/common';

/**
 * Get the default group of a team
 * @param{Object} obj
 * @param{string} obj.teamId
 * @param{ClientSession} obj.session
 */
export const getTeamDefaultGroup = async ({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}) => {
  const group = await MongoMemberGroupModel.findOne({ teamId, name: DefaultGroupName }, undefined, {
    session
  }).lean();

  // Create the default group if it does not exist
  if (!group) {
    const [group] = await MongoMemberGroupModel.create(
      [
        {
          teamId,
          name: DefaultGroupName
        }
      ],
      { session }
    );

    return group;
  }
  return group;
};

export const getGroupsByTmbId = async ({
  tmbId,
  teamId,
  role,
  session
}: {
  tmbId: string;
  teamId: string;
  role?: `${GroupMemberRole}`[];
  session?: ClientSession;
}) =>
  (
    await Promise.all([
      (
        await MongoGroupMemberModel.find(
          {
            tmbId,
            groupId: {
              $exists: true
            },
            ...(role ? { role: { $in: role } } : {})
          },
          undefined,
          { session }
        )
          .populate<{ group: MemberGroupSchemaType }>('group')
          .lean()
      ).map((item) => item.group),
      role ? [] : getTeamDefaultGroup({ teamId, session })
    ])
  ).flat();

export const getGroupMembersByGroupId = async (groupId: string) => {
  return await MongoGroupMemberModel.find({
    groupId
  }).lean();
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
    MongoGroupMemberModel.findOne({ groupId, tmbId }),
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
