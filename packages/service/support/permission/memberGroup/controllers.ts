import { MemberGroupSchemaType } from '@fastgpt/global/support/permission/memberGroup/type';
import { MongoGroupMemberModel } from './groupMemberSchema';
import { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../schema';
import { getMaxGroupPer } from '../controller';
import { MongoMemberGroupModel } from './memberGroupSchema';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';

export const getDefaultGroupByTeamId = async (teamId: string) => {
  const group = await MongoMemberGroupModel.findOne({
    teamId,
    name: DefaultGroupName
  }).lean();

  if (!group) {
    return await MongoMemberGroupModel.create({
      teamId,
      name: DefaultGroupName,
      avatar: ''
    });
  }

  return group;
};

export const getGroupsByTmbId = async ({ tmbId, teamId }: { tmbId: string; teamId: string }) => {
  return (
    await Promise.all([
      (
        await MongoGroupMemberModel.find({
          tmbId
        })
          .populate('groupId')
          .lean()
      ).map((item) => {
        return {
          ...(item.groupId as any as MemberGroupSchemaType)
        };
      }),
      await getDefaultGroupByTeamId(teamId)
    ])
  ).flat();
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

  return getMaxGroupPer(groupPermissions);
};
