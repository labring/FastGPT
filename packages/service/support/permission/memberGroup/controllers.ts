import { MemberGroupSchemaType } from '@fastgpt/global/support/permission/memberGroup/type';
import { MongoGroupMemberModel } from './groupMemberSchema';
import { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { getResourcePermission } from '../controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../schema';
import { MongoMemberGroupModel } from './memberGroupSchema';
import { Permission } from '@fastgpt/global/support/permission/controller';

export const getGroupsByTmbId = async (tmbId: string) => {
  return (
    await MongoGroupMemberModel.find({
      tmbId
    })
      .populate('groupId')
      .lean()
  ).map((item) => {
    return {
      ...(item.groupId as any as MemberGroupSchemaType)
    };
  });
};

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
  return (
    await MongoGroupMemberModel.find({
      groupId
    }).lean()
  ).map((item) => item.tmbId);
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
 * @returns
 */
export const getGroupPermission = async ({
  tmbId,
  resourceId,
  resourceType
}: {
  tmbId: string;
  resourceId: string;
  resourceType: `${PerResourceTypeEnum}`;
}) => {
  const groupIds = (await getGroupsByTmbId(tmbId)).map((item) => item._id);
  const groupPermissions = (
    await MongoResourcePermission.find({
      groupId: {
        $in: groupIds
      },
      resourceType,
      resourceId: resourceType === 'team' ? undefined : resourceId,
      teamId: resourceType === 'team' ? resourceId : undefined
    })
  ).map((item) => item.permission);
  const maxPermission = groupPermissions.length > 0 ? Math.max(...groupPermissions) : undefined;

  return maxPermission;
};

export const getGroupsByTeamId = async (teamId: string) => {
  const groups = await MongoMemberGroupModel.find({
    teamId
  }).lean();

  const members = await MongoGroupMemberModel.find({
    groupId: {
      $in: groups.map((item) => item._id)
    }
  }).lean();

  const permissions = await MongoResourcePermission.find({
    teamId,
    resourceType: PerResourceTypeEnum.team,
    groupId: {
      $in: groups.map((item) => item._id)
    }
  }).lean();

  return groups.map((group) => {
    const memberInGroup = members
      .filter((member) => String(member.groupId) === String(group._id))
      .map((item) => String(item.tmbId));
    const permission = permissions.find(
      (permission) => String(permission.groupId) === String(group._id)
    )?.permission;
    return {
      ...group,
      members: memberInGroup,
      permission
    };
  });
};
