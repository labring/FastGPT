import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { serviceEnv } from '@fastgpt/service/env';
import { setCookie } from '@fastgpt/service/support/permission/auth/common';
import {
  LoginByPasswordBodySchema,
  type LoginByPasswordBodyType,
  type LoginSuccessResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { passwordAccountVerification } from '@fastgpt/service/support/user/account/verification/password/service';
import { loginLocalAccount } from '@/service/support/user/login/service';

async function handler(
  req: ApiRequestProps<LoginByPasswordBodyType>,
  res: ApiResponseType
): Promise<LoginSuccessResponseType> {
  const { username, password, code, language, fastgpt_sem } = parseApiInput({
    req,
    bodySchema: LoginByPasswordBodySchema
  }).body;

  const identity = await passwordAccountVerification.consume({ username, password, code });
  const { user, token } = await loginLocalAccount({
    identity,
    language,
    fastgpt_sem,
    ip: getClientIpFromRequest(req)
  });

  setCookie(res, token);

  pushTrack.login({
    type: 'password',
    uid: user._id,
    teamId: user.team.teamId,
    tmbId: user.team.tmbId
  });
  addAuditLog({
    tmbId: user.team.tmbId,
    teamId: user.team.teamId,
    event: AuditEventEnum.LOGIN
  });

  return { user, token };
}

const lockTime = serviceEnv.PASSWORD_LOGIN_LOCK_SECONDS;
export default NextAPI(
  useIPFrequencyLimit({ id: 'login-by-password', seconds: lockTime, limit: 10, force: true }),
  handler
);
