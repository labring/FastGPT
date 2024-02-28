import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { TeamMemberWithUserSchema } from '@fastgpt/global/support/user/team/type';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import axios from 'axios';

export async function getUserChatInfoAndAuthTeamPoints(tmbId: string) {
  const tmb = (await MongoTeamMember.findById(tmbId, 'teamId userId').populate(
    'userId',
    'timezone openaiAccount'
  )) as TeamMemberWithUserSchema;
  if (!tmb) return Promise.reject(UserErrEnum.unAuthUser);

  await checkTeamAIPoints(tmb.teamId);

  return {
    user: tmb.userId
  };
}

type UserInfoType = {
  data: {
    uid: string;
    tags: string[];
  };
};

export async function getShareTeamUid(shareTeamId: string, authToken: string) {
  try {
    const teamInfo = await MongoTeam.findById(shareTeamId);
    const tagsUrl = teamInfo?.tagsUrl;
    const { data: userInfo } = await axios.post(tagsUrl + `/getUserInfo`, { autoken: authToken });

    const uid = userInfo?.data?.uid;
    if (uid) {
      throw new Error('uid null');
    }
    return uid;
  } catch (err) {
    return '';
  }
}
