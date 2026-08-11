import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

/* update user info */
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateUserAccountBodySchema,
  UpdateUserAccountResponseSchema,
  type UpdateUserAccountBody,
  type UpdateUserAccountResponse
} from '@fastgpt/global/openapi/support/user/account/update/api';

export type UserAccountUpdateQuery = Record<string, never>;

async function handler(
  req: ApiRequestProps<UpdateUserAccountBody, UserAccountUpdateQuery>,
  _res: ApiResponseType<any>
): Promise<UpdateUserAccountResponse> {
  const { avatar, timezone, language } = parseApiInput({
    req,
    bodySchema: UpdateUserAccountBodySchema
  }).body;

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

  return UpdateUserAccountResponseSchema.parse({});
}
export default NextAPI(handler);
