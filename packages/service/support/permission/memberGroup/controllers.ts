import { MemberGroupSchemaType } from '@fastgpt/global/support/permission/memberGroup/type';
import { MongoGroupMemberModel } from './groupMemberSchema';
import { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../schema';
import { getMaxGroupPer } from '../controller';

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
  const groupIds = (await getGroupsByTmbId(tmbId)).map((item) => item._id);
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
  return getMaxGroupPer(groupPermissions);
};
