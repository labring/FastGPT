import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { Types } from '../../../common/mongo';
import { MongoTeamMember } from './teamMemberSchema';

const toObjectIds = (ids: string[]) =>
  ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));

/** 查询指定团队内处于 active 状态的 userId -> tmbId 映射。 */
export const findActiveTeamMemberIdsByUserIds = async ({
  teamId,
  userIds,
  tx
}: {
  teamId: string;
  userIds: string[];
  tx?: DbSession;
}): Promise<Map<string, string>> => {
  if (userIds.length === 0) return new Map();

  const members = await MongoTeamMember.find(
    {
      teamId,
      userId: { $in: userIds },
      status: TeamMemberStatusEnum.active
    },
    '_id userId'
  )
    .session(unwrapMongoSession(tx) ?? null)
    .lean();

  return new Map(members.map((member) => [String(member.userId), String(member._id)]));
};

/** 校验并返回指定团队内处于 active 状态的 tmbId 集合；非法 ObjectId 自动忽略。 */
export const findActiveTeamMemberIds = async ({
  teamId,
  tmbIds,
  tx
}: {
  teamId: string;
  tmbIds: string[];
  tx?: DbSession;
}): Promise<Set<string>> => {
  const validObjectIds = toObjectIds(tmbIds);
  if (validObjectIds.length === 0) return new Set();

  const members = await MongoTeamMember.find(
    {
      teamId,
      _id: { $in: validObjectIds },
      status: TeamMemberStatusEnum.active
    },
    '_id'
  )
    .session(unwrapMongoSession(tx) ?? null)
    .lean();

  return new Set(members.map((item) => String(item._id)));
};
