import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { parseHeaderCertRet } from 'test/mocks/request';

export async function getRootUser(): Promise<parseHeaderCertRet> {
  const rootUser = await MongoUser.create({
    username: 'root',
    password: '123456'
  });

  const team = await MongoTeam.create({
    name: 'test team',
    ownerId: rootUser._id
  });

  const tmb = await MongoTeamMember.create({
    teamId: team._id,
    userId: rootUser._id,
    status: 'active'
  });

  return {
    userId: rootUser._id,
    apikey: '',
    appId: '',
    authType: AuthUserTypeEnum.token,
    isRoot: true,
    sourceName: undefined,
    teamId: tmb?.teamId,
    tmbId: tmb?._id
  };
}
