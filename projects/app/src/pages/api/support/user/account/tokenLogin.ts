import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type UserType } from '@fastgpt/global/support/user/type';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';

export type TokenLoginQuery = {};
export type TokenLoginBody = {};
export type TokenLoginResponse = UserType;

async function handler(
  req: ApiRequestProps<TokenLoginBody, TokenLoginQuery>,
  _res: ApiResponseType<any>
): Promise<TokenLoginResponse> {
  const { tmbId, userId, teamId } = await authCert({ req, authToken: true });
  const user = await getUserDetail({ tmbId });

  pushTrack.dailyUserActive({
    uid: userId,
    teamId: teamId,
    tmbId: tmbId
  });

  // Remove sensitive information
  // if (user.team.lafAccount) {
  //   user.team.lafAccount = {
  //     appid: user.team.lafAccount.appid,
  //     token: '',
  //     pat: ''
  //   };
  // }
  if (user.team.openaiAccount) {
    user.team.openaiAccount = {
      key: '',
      baseUrl: user.team.openaiAccount.baseUrl
    };
  }
  if (user.team.externalWorkflowVariables) {
    user.team.externalWorkflowVariables = Object.fromEntries(
      Object.entries(user.team.externalWorkflowVariables).map(([key, value]) => [key, ''])
    );
  }

  return user;
}
export default NextAPI(handler);
