import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type UserType } from '@fastgpt/global/support/user/type';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';

export type TokenLoginQuery = {};
export type TokenLoginBody = {};
export type TokenLoginResponse = UserType;

async function handler(
  req: ApiRequestProps<TokenLoginBody, TokenLoginQuery>,
  _res: ApiResponseType<any>
): Promise<TokenLoginResponse> {
  const { tmbId, userId, teamId } = await authCert({ req, authToken: true });
  const user = await getUserDetail({ tmbId });

  try {
    const redis = getGlobalRedisConnection();
    const today = new Date().toISOString().split('T')[0];
    const activeKey = `user_daily_active:${userId}:${today}`;

    const hasRecorded = await redis.get(activeKey);

    if (!hasRecorded) {
      console.log('dddd');
      await pushTrack.active({
        uid: userId,
        teamId: teamId,
        tmbId: tmbId
      });

      await redis.setex(activeKey, 26 * 60 * 60, '1');
    }
  } catch (error) {
    console.error('Failed to track user active:', error);
  }

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
