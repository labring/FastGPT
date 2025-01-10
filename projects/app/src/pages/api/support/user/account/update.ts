import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { UserUpdateParams } from '@/types/user';

/* update user info */
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { refreshSourceAvatar } from '@fastgpt/service/common/file/image/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
export type UserAccountUpdateQuery = {};
export type UserAccountUpdateBody = UserUpdateParams;
export type UserAccountUpdateResponse = {};
async function handler(
  req: ApiRequestProps<UserAccountUpdateBody, UserAccountUpdateQuery>,
  _res: ApiResponseType<any>
): Promise<UserAccountUpdateResponse> {
  const { avatar, timezone } = req.body;

  const { tmbId } = await authCert({ req, authToken: true });
  const user = await getUserDetail({ tmbId });

  // 更新对应的记录
  await mongoSessionRun(async (session) => {
    if (timezone) {
      await MongoUser.updateOne(
        {
          _id: user._id
        },
        {
          timezone
        }
      ).session(session);
    }
    // if avatar, update team member avatar
    if (avatar) {
      await MongoTeamMember.updateOne(
        {
          _id: tmbId
        },
        {
          avatar
        }
      ).session(session);
      await refreshSourceAvatar(avatar, user.team.avatar, session);
    }
  });

  return {};
}
export default NextAPI(handler);
