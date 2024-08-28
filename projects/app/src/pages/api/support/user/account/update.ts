import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { UserUpdateParams } from '@/types/user';
import { getAIApi, openaiBaseUrl } from '@fastgpt/service/core/ai/config';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

/* update user info */
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
export type UserAccountUpdateQuery = {};
export type UserAccountUpdateBody = UserUpdateParams;
export type UserAccountUpdateResponse = {};
async function handler(
  req: ApiRequestProps<UserAccountUpdateBody, UserAccountUpdateQuery>,
  _res: ApiResponseType<any>
): Promise<UserAccountUpdateResponse> {
  const { avatar, timezone, openaiAccount, lafAccount } = req.body;

  const { tmbId } = await authCert({ req, authToken: true });
  const tmb = await MongoTeamMember.findById(tmbId);
  if (!tmb) {
    throw new Error('can not find it');
  }
  const userId = tmb.userId;
  // auth key
  if (openaiAccount?.key) {
    console.log('auth user openai key', openaiAccount?.key);
    const baseUrl = openaiAccount?.baseUrl || openaiBaseUrl;
    openaiAccount.baseUrl = baseUrl;

    const ai = getAIApi({
      userKey: openaiAccount
    });

    const response = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }]
    });
    if (response?.choices?.[0]?.message?.content === undefined) {
      throw new Error('Key response is empty');
    }
  }

  // 更新对应的记录
  await MongoUser.updateOne(
    {
      _id: userId
    },
    {
      ...(avatar && { avatar }),
      ...(timezone && { timezone }),
      openaiAccount: openaiAccount?.key ? openaiAccount : null,
      lafAccount: lafAccount?.token ? lafAccount : null
    }
  );

  return {};
}
export default NextAPI(handler);
