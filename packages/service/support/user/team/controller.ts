import { TeamItemType } from '@fastgpt/global/support/user/team/type';
import { connectionMongo, Types } from '../../../common/mongo';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum,
  TeamCollectionName,
  TeamMemberCollectionName,
  leaveStatus
} from '@fastgpt/global/support/user/team/constant';

async function getTeam(match: Record<string, any>): Promise<TeamItemType> {
  const db = connectionMongo?.connection?.db;

  const TeamMember = db.collection(TeamMemberCollectionName);

  const results = await TeamMember.aggregate([
    {
      $match: match
    },
    {
      $lookup: {
        from: TeamCollectionName,
        localField: 'teamId',
        foreignField: '_id',
        as: 'team'
      }
    },
    {
      $unwind: '$team'
    }
  ]).toArray();
  const tmb = results[0];

  if (!tmb) {
    return Promise.reject('member not exist');
  }

  return {
    userId: String(tmb.userId),
    teamId: String(tmb.teamId),
    teamName: tmb.team.name,
    memberName: tmb.name,
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

export async function getTeamInfoByTmbId({ tmbId }: { tmbId: string }) {
  if (!tmbId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeam({
    _id: new Types.ObjectId(tmbId),
    status: leaveStatus
  });
}

export async function getUserDefaultTeam({ userId }: { userId: string }) {
  if (!userId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeam({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });
}
export async function createDefaultTeam({
  userId,
  teamName = 'My Team',
  avatar = '/icon/logo.svg',
  balance,
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
      name: 'Owner',
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
          ...(balance !== undefined && { balance }),
          maxSize
        }
      }
    );
  }
}
