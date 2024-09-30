import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
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
  const initRootUser = async () => {
    // init root user
    const rootUser = await MongoUser.create({
      username: 'root',
      password: '123456'
    });

    const rootTeam = await MongoTeam.create({
      name: 'root-default-team',
      ownerId: rootUser._id
    });

    const rootTeamMember = await MongoTeamMember.create({
      teamId: rootTeam._id,
      userId: rootUser._id,
      name: 'root-default-team-member',
      status: 'active',
      role: TeamMemberRoleEnum.owner
    });
    const rootApp = await MongoApp.create({
      name: 'root-default-app',
      teamId: rootTeam._id,
      tmbId: rootTeam._id,
      type: 'advanced'
    });

    root.uid = rootUser._id;
    root.tmbId = rootTeamMember._id;
    root.teamId = rootTeam._id;
    root.appId = rootApp._id;
  };

  await initRootUser();
};
