import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { transactionRunner, userRepository, teamRepository } from '@fastgpt/service/common/dal';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

/* update user info */
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateUserAccountBodySchema,
  type UpdateUserAccountBody,
  type UpdateUserAccountResponse
} from '@fastgpt/global/openapi/support/user/account/update/api';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);

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

  const tmb = await teamRepository.findMemberById(tmbId);
  if (!tmb) {
    return Promise.reject('can not find it');
  }

  // user 字段与 tmb 头像在同一个 DAL 事务内更新，避免混用两种事务上下文。
  await transactionRunner.withTransaction(async (context) => {
    if (timezone || language) {
      await userRepository.updateById(
        tmb.userId,
        {
          ...(timezone && { timezone }),
          ...(language && { language })
        },
        context
      );
    }
    // if avatar, update team member avatar
    if (avatar) {
      await teamRepository.updateMemberAvatar(tmbId, avatar, context);
    }
  });

  // S3 头像刷新（含 MongoS3TTL 清理）在事务提交后执行：best-effort，
  // 避免把 s3_ttl 集合拖进 DAL 事务；失败只记录日志，不影响更新结果。
  if (avatar && avatar !== tmb.avatar) {
    try {
      await getS3AvatarSource().refreshAvatar(avatar, tmb.avatar);
    } catch (error) {
      logger.warn('Avatar refresh failed after account update', { error, tmbId });
    }
  }

  return {};
}
export default NextAPI(handler);
