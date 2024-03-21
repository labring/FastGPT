import {
  InviteResponseType,
  InviteTeamMemberItemType,
  TeamItemType,
  TeamMemberWithTeamSchema
} from '@fastgpt/global/support/user/team/type';
import { ClientSession, Types } from '../../../common/mongo';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum,
  notLeaveStatus
} from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from './teamMemberSchema';
import { MongoTeam } from './teamSchema';

async function getTeamMember(match: Record<string, any>): Promise<TeamItemType> {
  const tmb = (await MongoTeamMember.findOne(match).populate('teamId')) as TeamMemberWithTeamSchema;

  if (!tmb) {
    return Promise.reject('member not exist');
  }

  return {
    userId: String(tmb.userId),
    teamId: String(tmb.teamId._id),
    teamName: tmb.teamId.name,
    memberName: tmb.name,
    avatar: tmb.teamId.avatar,
    balance: tmb.teamId.balance,
    tmbId: String(tmb._id),
    teamDomain: tmb.teamId?.teamDomain,
    role: tmb.role,
    status: tmb.status,
    defaultTeam: tmb.defaultTeam,
    canWrite: tmb.role !== TeamMemberRoleEnum.visitor,
    maxSize: tmb.teamId.maxSize
  };
}

export async function getTmbInfoByTmbId({ tmbId }: { tmbId: string }) {
  if (!tmbId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember({
    _id: new Types.ObjectId(String(tmbId)),
    status: notLeaveStatus
  });
}

export async function getUserDefaultTeam({ userId }: { userId: string }) {
  if (!userId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });
}
export async function createDefaultTeam({
  userId,
  teamName = 'My Team',
  avatar = '/icon/logo.svg',
  role = TeamMemberRoleEnum.owner,
  balance,
  maxSize = 50
}: {
  userId: string;
  teamName?: string;
  avatar?: string;
  role?: string;
  balance?: number;
  maxSize?: number;
}) {
  // auth default team
  const tmb = await MongoTeamMember.findOne({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });

  if (!tmb) {
    console.log('create default team', userId);

    // create
    const { _id: insertedId } = await MongoTeam.create({
      ownerId: userId,
      name: teamName,
      avatar,
      balance,
      maxSize,
      createTime: new Date()
    });
    await MongoTeamMember.create({
      teamId: insertedId,
      userId,
      name: 'Owner',
      role: role,
      status: TeamMemberStatusEnum.active,
      createTime: new Date(),
      defaultTeam: true
    });
  } else {
    console.log('default team exist', userId);
    await MongoTeam.findByIdAndUpdate(tmb.teamId, {
      $set: {
        ...(balance !== undefined && { balance }),
        maxSize
      }
    });
  }
}

export async function findMatchTeamMember(
  data: InviteTeamMemberItemType[],
  teamId: string,
  userId: string
) {
  let result: any[] = [];
  let invite: {
    teamId: string;
    userId: string;
    name: string;
    role: 'owner' | 'admin' | 'visitor';
    status: TeamMemberStatusEnum;
    createTime: Date;
    defaultTeam: boolean;
  }[] = [];
  let inTeam: InviteResponseType[] = [];
  // 当前操作用户不能再加入
  for (const item of data) {
    if (item.userId) {
      const hasTem = await MongoTeamMember.findOne({
        teamId: new Types.ObjectId(teamId),
        userId: item.userId
      });
      result.push({
        hasTem,
        item
      });
    }
  }
  return await Promise.all(result).then((res) => {
    res.forEach((teamMember) => {
      const { item, hasTem } = teamMember;
      if (!hasTem && item.userId != userId) {
        invite.push({
          teamId: teamId,
          userId: item.userId,
          name: item.name,
          role: item.role,
          status: TeamMemberStatusEnum.active,
          createTime: new Date(),
          defaultTeam: true
        });
      } else {
        inTeam.push({
          userId: item.userId,
          username: item.username
        });
      }
    });
    return {
      invite,
      inTeam
    };
  });
}
