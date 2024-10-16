import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

export const root = {
  uid: '',
  tmbId: '',
  teamId: '',
  isRoot: true,
  appId: ''
};

export const initMockData = async () => {
  const [rootUser] = await MongoUser.create([
    {
      username: 'root',
      password: '123456'
    }
  ]);
  root.uid = String(rootUser._id);
  const [rootTeam] = await MongoTeam.create([
    {
      name: 'root Team'
    }
  ]);
  root.teamId = String(rootTeam._id);
  const [rootTmb] = await MongoTeamMember.create([
    {
      teamId: rootTeam._id,
      name: 'owner',
      role: 'owner',
      userId: rootUser._id,
      status: 'active'
    }
  ]);
  root.tmbId = String(rootTmb._id);
  await MongoMemberGroupModel.create([
    {
      name: DefaultGroupName,
      teamId: rootTeam._id
    }
  ]);

  const [rootApp] = await MongoApp.create([
    {
      name: 'root Test App',
      teamId: rootTeam._id,
      tmbId: rootTmb._id
    }
  ]);

  root.appId = String(rootApp._id);
};
