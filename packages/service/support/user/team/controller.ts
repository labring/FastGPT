import { TeamItemType } from '@fastgpt/global/support/user/team/type';
import { connectionMongo, Types } from '../../../common/mongo';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum,
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export async function getTeamInfoByTmbId({
  tmbId,
  userId
}: {
  tmbId?: string;
  userId?: string;
}): Promise<TeamItemType> {
  if (!tmbId && !userId) {
    return Promise.reject('tmbId or userId is required');
  }

  const db = connectionMongo?.connection?.db;

  const TeamMember = db.collection(TeamMemberCollectionName);

  const results = await TeamMember.aggregate([
    {
      $match: tmbId
        ? {
            _id: new Types.ObjectId(tmbId)
          }
        : {
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
    return Promise.reject('team not exist');
  }

  return {
    userId: String(tmb.userId),
    teamId: String(tmb.teamId),
    teamName: tmb.team.name,
    avatar: tmb.team.avatar,
    balance: tmb.team.balance,
    tmbId: String(tmb._id),
    role: tmb.role,
    status: tmb.status,
    defaultTeam: tmb.defaultTeam,
    canWrite: tmb.role !== TeamMemberRoleEnum.visitor,
    maxSize: tmb.team.maxSize
  };
}
export async function createDefaultTeam({
  userId,
  teamName = 'My Team',
  avatar = '/icon/logo.svg',
  balance = 0,
  maxSize = 5
}: {
  userId: string;
  teamName?: string;
  avatar?: string;
  balance?: number;
  maxSize?: number;
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
      avatar,
      balance,
      maxSize,
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
    await Team.updateOne(
      {
        _id: new Types.ObjectId(tmb.teamId)
      },
      {
        $set: {
          balance,
          maxSize
        }
      }
    );
  }
}
