import { Types, type ClientSession } from '../../../common/mongo';
import { MongoTeamMember } from './teamMemberSchema';
import { type UserModelSchema } from '@fastgpt/global/support/user/type';
import { type TeamSchema } from '@fastgpt/global/support/user/team/type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

/**
 * 批量查询团队成员并按成员 ID 建索引。
 * 统一过滤非法 ID 和空查询，避免调用方在循环中反复 find。
 */
export async function getTeamMemberMap({
  teamId,
  memberIds,
  fields,
  session
}: {
  teamId?: string | Types.ObjectId;
  memberIds?: Array<string | Types.ObjectId>;
  fields?: string;
  session?: ClientSession;
}) {
  const objectIds = memberIds
    ?.filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (memberIds && !objectIds?.length) return new Map();

  const members = await MongoTeamMember.find(
    {
      ...(teamId ? { teamId } : {}),
      ...(objectIds ? { _id: { $in: objectIds } } : {})
    },
    fields,
    { session }
  ).lean();
  return new Map(members.map((member) => [String(member._id), member]));
}

export async function getUserIdByTmbId(tmbId: string) {
  const tmb = await MongoTeamMember.findById(tmbId, 'userId').lean();
  if (!tmb) return Promise.reject(TeamErrEnum.notUser);
  return String(tmb.userId);
}

// TODO: 数据库优化
export async function getRunningUserInfoByTmbId(tmbId: string) {
  if (tmbId) {
    const tmb = await MongoTeamMember.findById(tmbId, 'teamId name userId') // team_members name is the user's name
      .populate<{ team: TeamSchema; user: UserModelSchema }>([
        {
          path: 'team',
          select: 'name'
        },
        {
          path: 'user',
          select: 'username contact'
        }
      ])
      .lean();

    if (!tmb) return Promise.reject(TeamErrEnum.notUser);

    return {
      username: tmb.user.username,
      teamName: tmb.team.name,
      memberName: tmb.name,
      contact: tmb.user.contact || '',
      teamId: tmb.teamId,
      tmbId: tmb._id
    };
  }

  return Promise.reject(TeamErrEnum.notUser);
}

export async function getUserChatInfo(tmbId: string) {
  const tmb = await MongoTeamMember.findById(tmbId, 'userId teamId')
    .populate<{ user: UserModelSchema; team: TeamSchema }>([
      {
        path: 'user',
        select: 'timezone'
      },
      {
        path: 'team',
        select: 'openaiAccount externalWorkflowVariables'
      }
    ])
    .lean();

  if (!tmb) return Promise.reject(TeamErrEnum.notUser);

  return {
    timezone: tmb.user.timezone,
    externalProvider: {
      openaiAccount: tmb.team.openaiAccount,
      externalWorkflowVariables: tmb.team.externalWorkflowVariables
    }
  };
}
