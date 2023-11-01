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
  let team: TeamItemType | undefined = undefined;
  try {
    team = await GET<TeamItemType>(
      '/support/user/team/getTokenTeam',
      {},
      {
        headers: {
          token: createJWT({ _id: userId, team: { teamMemberId: tmbId } })
        }
      }
    );
  } catch (error) {}
  return team;
}
export async function createDefaultTeam({
  userId,
  teamName = 'My Team'
}: {
  userId: string;
  teamName?: string;
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
      balance: 0,
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
