import { MemberGroupSchemaType } from '@fastgpt/global/support/permission/memberGroup/type';
import { MongoGroupMemberModel } from './groupMemberSchema';
import { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../schema';
import { getGroupPer, parseHeaderCert } from '../controller';
import { MongoMemberGroupModel } from './memberGroupSchema';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { ClientSession } from 'mongoose';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { AuthModeType, AuthResponseType } from '../type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';

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
  role
}: {
  tmbId: string;
  teamId: string;
  role?: `${GroupMemberRole}`[];
}) =>
  (
    await Promise.all([
      (
        await MongoGroupMemberModel.find({
          tmbId,
          groupId: {
            $exists: true
          },
          ...(role ? { role: { $in: role } } : {})
        })
          .populate('groupId')
          .lean()
      ).map((item) => {
        return {
          ...(item.groupId as any as MemberGroupSchemaType)
        };
      }),

      role ? [] : getTeamDefaultGroup({ teamId })
    ])
  ).flat();

export const getTmbByGroupId = async (groupId: string) => {
  return (
    await MongoGroupMemberModel.find({
      groupId
    })
      .populate('tmbId')
      .lean()
  ).map((item) => {
    return {
      ...(item.tmbId as any as MemberGroupSchemaType)
    };
  });
};

export const getGroupMembersByGroupId = async (groupId: string) => {
  return await MongoGroupMemberModel.find({
    groupId
  }).lean();
};

export const getGroupMembersWithInfoByGroupId = async (groupId: string) => {
  return (
    await MongoGroupMemberModel.find({
      groupId
    })
      .populate('tmbId')
      .lean()
  ).map((item) => item.tmbId) as any as TeamMemberSchema[]; // HACK: type casting
};

/**
 * Get tmb's group permission: the maximum permission of the group
 * @param tmbId
 * @param resourceId
 * @param resourceType
 * @returns the maximum permission of the group
 */
export const getGroupPermission = async ({
  tmbId,
  resourceId,
  teamId,
  resourceType
}: {
  tmbId: string;
  teamId: string;
} & (
  | {
      resourceId?: undefined;
      resourceType: 'team';
    }
  | {
      resourceId: string;
      resourceType: Omit<PerResourceTypeEnum, 'team'>;
    }
)) => {
  const groupIds = (await getGroupsByTmbId({ tmbId, teamId })).map((item) => item._id);
  const groupPermissions = (
    await MongoResourcePermission.find({
      groupId: {
        $in: groupIds
      },
      resourceType,
      resourceId,
      teamId
    })
  ).map((item) => item.permission);

  return getGroupPer(groupPermissions);
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
  const groupMember = await MongoGroupMemberModel.findOne({ groupId, tmbId });
  const tmb = await getTmbInfoByTmbId({ tmbId });
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
