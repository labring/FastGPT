import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { createUserLoginTeam } from '@fastgpt/service/support/user/team/controller';
import { withUserLock } from '@fastgpt/service/support/user/lock';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { NextAPI } from '@/service/middleware/entry';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { passwordVerificationService } from '@fastgpt/service/support/user/account/verification/password/service';
import { createUserSession } from '@fastgpt/service/support/user/session';
import { setCookie } from '@fastgpt/service/support/permission/auth/common';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  LoginByPasswordBodySchema,
  type LoginByPasswordBodyType,
  type LoginSuccessResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  reportCRMVisitorIdentity,
  resolveCRMVisitorId
} from '@fastgpt/service/support/marketing/attribution';
import { assertUserCanLogin } from '@fastgpt/service/support/user/account/cancellation/guard';

async function handler(
  req: ApiRequestProps<LoginByPasswordBodyType>,
  res: ApiResponseType
): Promise<LoginSuccessResponseType> {
  const { username, password, code, language, fastgpt_sem } = parseApiInput({
    req,
    bodySchema: LoginByPasswordBodySchema
  }).body;

  const runLogin = () =>
    passwordVerificationService.withVerifiedCredentials(
      {
        username,
        password,
        code,
        purpose: 'login'
      },
      async ({ user, session }) => {
        if (user.status === UserStatusEnum.forbidden) {
          return Promise.reject('Invalid account!');
        }

        if (user.username.startsWith('wecom-')) {
          return Promise.reject(new UserError('Wecom user can not login with password'));
        }

        await assertUserCanLogin(String(user._id));

        const userDetail = await getUserDetail({
          tmbId: user?.lastLoginTmbId,
          userId: user._id,
          isRoot: username === 'root',
          session,
          createTeamIfUnavailable:
            username !== 'root' && global.systemConfig?.teamMode === 'multi'
              ? ({ userId, session }) =>
                  createUserLoginTeam({
                    userId,
                    username: user.username,
                    session: session as NonNullable<typeof session>
                  })
              : undefined
        });

        user.lastLoginTmbId = userDetail.team.tmbId;
        user.language = language;
        const visitorIdentity = resolveCRMVisitorId({
          storedFastgptSem: user.fastgpt_sem,
          incomingVisitorId: fastgpt_sem?.visitor_id
        });
        if (visitorIdentity.shouldPersist) {
          user.fastgpt_sem = visitorIdentity.fastgptSem;
        }
        await user.save({ session });

        return { user, userDetail, visitorIdentity };
      }
    );
  const userForLock = await MongoUser.findOne({ username }, { _id: 1 }).lean();
  const { user, userDetail, visitorIdentity } = userForLock
    ? await withUserLock(String(userForLock._id), runLogin)
    : await runLogin();

  const token = await createUserSession({
    userId: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId,
    isRoot: username === 'root',
    ip: getClientIpFromRequest(req)
  });

  setCookie(res, token);

  void reportCRMVisitorIdentity({
    visitorId: visitorIdentity.visitorId,
    userId: String(user._id),
    username: user.username,
    contact: user.contact ?? undefined
  });

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

export default NextAPI(handler);
