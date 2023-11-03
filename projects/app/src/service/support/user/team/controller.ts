import { GET } from '@fastgpt/service/common/api/plusRequest';
import { TeamItemType } from '@fastgpt/global/support/user/team/type';
import { createJWT } from '@fastgpt/service/support/permission/controller';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum,
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { Types } from 'mongoose';

export async function getTeamInfoByUIdAndTmbId(userId: string, tmbId = '') {
  if (global.systemEnv.pluginBaseUrl) {
    return await GET<TeamItemType>(
      '/support/user/team/getTokenTeam',
      {},
      {
        headers: {
          token: createJWT({ _id: userId, team: { tmbId } })
        }
      }
    );
  } else {
    return getDefaultTeamMember(userId);
  }
}
export async function getTeamRole(userId: string, tmbId = '') {
  const team = await getTeamInfoByUIdAndTmbId(userId, tmbId);
  return {
    role: team.role,
    canWrite: team.canWrite
  };
}
export async function createDefaultTeam({
  userId,
  teamName = 'My Team',
  balance = 0
}: {
  userId: string;
  teamName?: string;
  balance?: number;
}) {
  const db = connectionMongo.connection.db;
  const Team = db.collection(TeamCollectionName);
  const TeamMember = db.collection(TeamMemberCollectionName);

  // auth default team
  const tmb = await TeamMember.findOne({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });

  if (!tmb) {
    console.log('create default team', userId);

    // create
    const { insertedId } = await Team.insertOne({
      ownerId: userId,
      name: teamName,
      avatar: '/icon/logo.svg',
      balance,
      maxSize: 1,
      createTime: new Date()
    });
    await TeamMember.insertOne({
      teamId: insertedId,
      userId,
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.active,
      createTime: new Date(),
      defaultTeam: true
    });
  } else {
    console.log('default team exist', userId);
  }
}
export async function getDefaultTeamMember(userId: string): Promise<TeamItemType> {
  const db = connectionMongo.connection.db;
  const TeamMember = db.collection(TeamMemberCollectionName);

  const results = await TeamMember.aggregate([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        defaultTeam: true
      }
    },
    {
      $lookup: {
        from: TeamCollectionName, // 关联的集合名
        localField: 'teamId', // TeamMember 集合中用于关联的字段
        foreignField: '_id', // Team 集合中用于关联的字段
        as: 'team' // 查询结果中的字段名，存放关联查询的结果
      }
    },
    {
      $unwind: '$team' // 将查询结果中的 team 字段展开，变成一个对象
    }
  ]).toArray();
  const tmb = results[0];

  if (!tmb) {
    return Promise.reject('default team not exist');
  }

  return {
    teamId: String(tmb.teamId),
    teamName: tmb.team.name,
    avatar: tmb.team.avatar,
    balance: tmb.team.balance,
    tmbId: String(tmb._id),
    role: tmb.role,
    status: tmb.status,
    defaultTeam: tmb.defaultTeam,
    canWrite: tmb.role !== TeamMemberRoleEnum.visitor
  };
}
