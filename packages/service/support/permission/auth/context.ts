import {
  TeamCollectionName,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { Types } from 'mongoose';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';

export type AuthContext = {
  userId: string;
  teamId: string;
  tmbId: string;
  ownerId?: string;
};

type AuthContextAggregationResult = {
  userId: Types.ObjectId;
  teamId: Types.ObjectId;
  tmbId: Types.ObjectId;
  ownerId?: Types.ObjectId;
};

const toObjectId = (value?: string) => {
  if (!value || !Types.ObjectId.isValid(value)) return undefined;
  return new Types.ObjectId(value);
};

/**
 * 构造中心鉴权使用的成员/团队聚合。聚合同时确认 active member、未删除团队和当前 owner，
 * 让后续注销 guard 不需要再次读取成员与团队，也让 API Key 使用数据库中的真实成员身份。
 */
export const buildAuthContextPipeline = ({
  userId,
  teamId,
  tmbId
}: {
  userId?: string;
  teamId: string;
  tmbId: string;
}) => {
  const objectTeamId = toObjectId(teamId);
  const objectTmbId = toObjectId(tmbId);
  const objectUserId = toObjectId(userId);
  if (!objectTeamId || !objectTmbId || (userId && !objectUserId)) return null;

  return [
    {
      $match: {
        _id: objectTmbId,
        teamId: objectTeamId,
        status: TeamMemberStatusEnum.active,
        ...(objectUserId ? { userId: objectUserId } : {})
      }
    },
    {
      $lookup: {
        from: TeamCollectionName,
        localField: 'teamId',
        foreignField: '_id',
        as: 'team'
      }
    },
    { $unwind: '$team' },
    {
      $match: {
        $or: [{ 'team.deleteTime': { $exists: false } }, { 'team.deleteTime': null }]
      }
    },
    {
      $project: {
        _id: 0,
        userId: 1,
        teamId: 1,
        tmbId: '$_id',
        ownerId: '$team.ownerId'
      }
    }
  ];
};

/**
 * 解析并验证当前请求的 auth-context。返回 null 表示成员、团队或身份已失效，调用方负责决定
 * 是否进入 Session fallback；API Key 调用方应直接拒绝，不得复用其它 Session。
 */
export const resolveAuthContext = async (props: {
  userId?: string;
  teamId: string;
  tmbId: string;
}): Promise<AuthContext | null> => {
  const pipeline = buildAuthContextPipeline(props);
  if (!pipeline) return null;

  const [result] = await MongoTeamMember.aggregate<AuthContextAggregationResult>(pipeline);
  if (!result) return null;

  return {
    userId: String(result.userId),
    teamId: String(result.teamId),
    tmbId: String(result.tmbId),
    ...(result.ownerId ? { ownerId: String(result.ownerId) } : {})
  };
};
