import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { UserUpdateParams } from '@/types/user';
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
  const { avatar, timezone } = req.body;

  const { tmbId } = await authCert({ req, authToken: true });
  const tmb = await MongoTeamMember.findById(tmbId);
  if (!tmb) {
    throw new Error('can not find it');
  }
  const userId = tmb.userId;

  // 更新对应的记录
  await MongoUser.updateOne(
    {
      _id: userId
    },
    {
      ...(avatar && { avatar }),
      ...(timezone && { timezone })
    }
  );

  return {};
}
export default NextAPI(handler);
