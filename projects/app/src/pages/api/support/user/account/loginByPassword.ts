import { MongoUser } from '@fastgpt/service/support/user/schema';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { authCode } from '@fastgpt/service/support/user/auth/controller';
import { createUserSession } from '@fastgpt/service/support/user/session';
import requestIp from 'request-ip';
import { setCookie } from '@fastgpt/service/support/permission/auth/common';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  LoginByPasswordBodySchema,
  type LoginByPasswordBodyType,
  type LoginSuccessResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { env } from '@fastgpt/service/env';
import {
  assertLoginNotLockedByFailures,
  buildLoginFailureEventId,
  clearLoginFailures,
  logLoginSecurityEvent,
  normalizeLoginAccountKey,
  recordLoginFailure
} from '@fastgpt/service/common/system/loginLockout/utils';

async function handler(
  req: ApiRequestProps<LoginByPasswordBodyType>,
  res: ApiResponseType
): Promise<LoginSuccessResponseType> {
  const { username, password, code, language } = LoginByPasswordBodySchema.parse(req.body);
  const clientIp = requestIp.getClientIp(req) || 'unknown';
  const userAgent =
    typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
  const maxAttempts = env.LOGIN_FAIL_MAX_ATTEMPTS;
  const windowSeconds = env.LOGIN_FAIL_WINDOW_SECONDS ?? env.PASSWORD_LOGIN_LOCK_SECONDS;
  const normalizedAccount = normalizeLoginAccountKey(username);
  const failEventId = buildLoginFailureEventId('app-password', username, clientIp);

  await assertLoginNotLockedByFailures({
    eventId: failEventId,
    maxAttempts,
    scope: 'app-password',
    normalizedAccount,
    ip: clientIp,
    userAgent
  });

  try {
    await authCode({
      key: username,
      code,
      type: UserAuthTypeEnum.login
    });
  } catch (e) {
    const failCount = await recordLoginFailure({ eventId: failEventId, windowSeconds });
    logLoginSecurityEvent({
      scope: 'app-password',
      result: 'auth_code_failed',
      normalizedAccount,
      ip: clientIp,
      failCount,
      userAgent
    });
    throw e;
  }

  const user = await MongoUser.findOne({
    username,
    password
  });

  if (!user) {
    const failCount = await recordLoginFailure({ eventId: failEventId, windowSeconds });
    logLoginSecurityEvent({
      scope: 'app-password',
      result: 'wrong_password',
      normalizedAccount,
      ip: clientIp,
      failCount,
      userAgent
    });
    return Promise.reject(UserErrEnum.account_psw_error);
  }
  if (user.status === UserStatusEnum.forbidden) {
    const failCount = await recordLoginFailure({ eventId: failEventId, windowSeconds });
    logLoginSecurityEvent({
      scope: 'app-password',
      result: 'invalid_account',
      normalizedAccount,
      ip: clientIp,
      failCount,
      userAgent
    });
    return Promise.reject('Invalid account!');
  }

  if (user.username.startsWith('wecom-')) {
    const failCount = await recordLoginFailure({ eventId: failEventId, windowSeconds });
    logLoginSecurityEvent({
      scope: 'app-password',
      result: 'invalid_account',
      normalizedAccount,
      ip: clientIp,
      failCount,
      userAgent
    });
    return Promise.reject(new UserError('Wecom user can not login with password'));
  }

  const userDetail = await getUserDetail({
    tmbId: user?.lastLoginTmbId,
    userId: user._id
  });

  await clearLoginFailures(failEventId);

  user.lastLoginTmbId = userDetail.team.tmbId;
  user.language = language;
  await user.save();

  const token = await createUserSession({
    userId: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId,
    isRoot: username === 'root',
    ip: requestIp.getClientIp(req)
  });

  setCookie(res, token);

  pushTrack.login({
    type: 'password',
    uid: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId
  });
  addAuditLog({
    tmbId: userDetail.team.tmbId,
    teamId: userDetail.team.teamId,
    event: AuditEventEnum.LOGIN
  });

  return {
    user: userDetail,
    token
  };
}

const lockTime = env.PASSWORD_LOGIN_LOCK_SECONDS;
export default NextAPI(
  useIPFrequencyLimit({
    id: 'login-by-password',
    seconds: lockTime,
    limit: 10,
    force: true,
    failClosed: true
  }),
  handler
);
