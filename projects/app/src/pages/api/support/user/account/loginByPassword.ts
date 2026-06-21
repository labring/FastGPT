import { MongoUser } from '@fastgpt/service/support/user/schema';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { serviceEnv } from '@fastgpt/service/env';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { authCode } from '@fastgpt/service/support/user/auth/controller';
import { createUserSession } from '@fastgpt/service/support/user/session';
import { setCookie } from '@fastgpt/service/support/permission/auth/common';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  LoginByPasswordBodySchema,
  type LoginByPasswordBodyType,
  type LoginSuccessResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  createAnonymousAuditActor,
  createUserAuditActor,
  getEnterpriseAuditRequestContext,
  writeEnterpriseAuditEvent
} from '@fastgpt/service/support/enterprise/audit/util';
import {
  EnterpriseAuditActionEnum,
  EnterpriseAuditResourceTypeEnum,
  EnterpriseAuditResultEnum
} from '@fastgpt/global/support/enterprise/audit/constants';

async function handler(
  req: ApiRequestProps<LoginByPasswordBodyType>,
  res: ApiResponseType
): Promise<LoginSuccessResponseType> {
  const { username, password, code, language } = parseApiInput({
    req,
    bodySchema: LoginByPasswordBodySchema
  }).body;
  const { clientIp, userAgent, requestId } = getEnterpriseAuditRequestContext(req);

  if (!serviceEnv.ENTERPRISE_PASSWORD_LOGIN_ENABLED && username !== 'root') {
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.UserLoginFailure,
      result: EnterpriseAuditResultEnum.Failure,
      actor: createAnonymousAuditActor(username),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.User,
        name: username
      },
      requestId,
      clientIp,
      userAgent,
      metadata: {
        reason: 'password_login_disabled'
      }
    });
    return Promise.reject('Password login is disabled');
  }

  // Auth prelogin code
  await authCode({
    key: username,
    code,
    type: UserAuthTypeEnum.login
  });

  const user = await MongoUser.findOne({
    username,
    password
  });

  if (!user) {
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.UserLoginFailure,
      result: EnterpriseAuditResultEnum.Failure,
      actor: createAnonymousAuditActor(username),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.User,
        name: username
      },
      requestId,
      clientIp,
      userAgent,
      metadata: {
        reason: 'account_psw_error'
      }
    });
    return Promise.reject(UserErrEnum.account_psw_error);
  }
  if (user.status === UserStatusEnum.forbidden) {
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.UserLoginFailure,
      result: EnterpriseAuditResultEnum.Failure,
      actor: createAnonymousAuditActor(username),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.User,
        id: String(user._id),
        name: username
      },
      requestId,
      clientIp,
      userAgent,
      metadata: {
        reason: 'account_forbidden'
      }
    });
    return Promise.reject('Invalid account!');
  }

  if (user) {
    if (user.username.startsWith('wecom-')) {
      writeEnterpriseAuditEvent({
        action: EnterpriseAuditActionEnum.UserLoginFailure,
        result: EnterpriseAuditResultEnum.Failure,
        actor: createAnonymousAuditActor(username),
        resource: {
          type: EnterpriseAuditResourceTypeEnum.User,
          id: String(user._id),
          name: username
        },
        requestId,
        clientIp,
        userAgent,
        metadata: {
          reason: 'wecom_password_login_denied'
        }
      });
      return Promise.reject(new UserError('Wecom user can not login with password'));
    }
  }

  const userDetail = await getUserDetail({
    tmbId: user?.lastLoginTmbId,
    userId: user._id,
    isRoot: username === 'root'
  });

  user.lastLoginTmbId = userDetail.team.tmbId;
  user.language = language;
  await user.save();

  const token = await createUserSession({
    userId: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId,
    isRoot: username === 'root',
    ip: clientIp
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
  writeEnterpriseAuditEvent({
    action: EnterpriseAuditActionEnum.UserLoginSuccess,
    result: EnterpriseAuditResultEnum.Success,
    actor: createUserAuditActor({
      userId: String(user._id),
      teamId: userDetail.team.teamId,
      tmbId: userDetail.team.tmbId,
      isRoot: username === 'root',
      name: username
    }),
    resource: {
      type: EnterpriseAuditResourceTypeEnum.User,
      id: String(user._id),
      name: username
    },
    requestId,
    clientIp,
    userAgent,
    metadata: {
      method: 'password'
    }
  });

  return {
    user: userDetail,
    token
  };
}

const lockTime = serviceEnv.PASSWORD_LOGIN_LOCK_SECONDS;
export default NextAPI(
  useIPFrequencyLimit({ id: 'login-by-password', seconds: lockTime, limit: 10, force: true }),
  handler
);
