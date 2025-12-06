import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type UserUpdateParams } from '@/types/user';

/* update user info */
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';

export type UserAccountUpdateQuery = {};
export type UserAccountUpdateBody = UserUpdateParams;
export type UserAccountUpdateResponse = {};

async function handler(
  req: ApiRequestProps<UserAccountUpdateBody, UserAccountUpdateQuery>,
  _res: ApiResponseType<any>
): Promise<UserAccountUpdateResponse> {
  const { avatar, timezone, language } = req.body;

  const { tmbId } = await authCert({ req, authToken: true });
  // const user = await getUserDetail({ tmbId });

  // 更新对应的记录
  await mongoSessionRun(async (session) => {
    const tmb = await MongoTeamMember.findById(tmbId).session(session);
    if (timezone || language) {
      await MongoUser.updateOne(
        {
          _id: tmb?.userId
        },
        {
          ...(timezone && { timezone }),
          ...(language && { language })
        }
      ).session(session);
    }
    // if avatar, update team member avatar
    if (avatar) {
      await MongoTeamMember.updateOne({ _id: tmbId }, { avatar }).session(session);

      await getS3AvatarSource().refreshAvatar(avatar, tmb?.avatar, session);
    }
  });

  return {};
}
export default NextAPI(handler);
