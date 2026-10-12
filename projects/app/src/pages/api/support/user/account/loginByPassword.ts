import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import {
  LoginByPasswordBodySchema,
  type LoginByPasswordBodyType,
  type LoginByPasswordResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import { passwordVerificationService } from '@fastgpt/service/support/user/account/verification/password/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { NextAPI } from '@/service/middleware/entry';
import {
  assertPasswordLoginUser,
  completePasswordLogin,
  finishPasswordLogin
} from '@fastgpt/service/support/user/account/login/service';
import {
  createLoginChallenge,
  isLoginContactUsername,
  isLoginVerificationEnabled,
  resolveLoginVerification
} from '@fastgpt/service/support/user/account/login/verification/service';
import { assertUserPasswordAvailable } from '@fastgpt/service/support/user/account/password/service';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { withUserLock } from '@fastgpt/service/support/user/lock';

/**
 * 验证密码和预登录码后，按开关及账号联系方式决定直接登录或创建二次验证 Challenge。
 * Challenge 阶段只消费预登录材料，不创建 Session、Cookie 或登录成功副作用。
 */
async function handler(
  req: ApiRequestProps<LoginByPasswordBodyType>,
  res: ApiResponseType
): Promise<LoginByPasswordResponseType> {
  const { username, password, code, language, fastgpt_sem } = parseApiInput({
    req,
    bodySchema: LoginByPasswordBodySchema
  }).body;

  const loginVerification = await (async () => {
    // 先做无 IO 的用户名判断，再读开关，避免普通用户名登录也查一次配置
    if (!isLoginContactUsername(username)) return;
    if (!(await isLoginVerificationEnabled())) return;
    return resolveLoginVerification({ username });
  })();

  const runLogin = () =>
    passwordVerificationService.withVerifiedCredentials(
      {
        username,
        password,
        code,
        purpose: 'login',
        // 验证码材料先在事务内确认，再执行账号策略守卫；这样受限账号不会绕过
        // 登录频率限制和验证码门槛，同时不会通过密码正确性暴露账号分类。
        beforeFindUserByCredentials: ({ username }) => assertUserPasswordAvailable(username)
      },
      async ({ user, session }) => {
        if (loginVerification?.status === 'supported') {
          await assertPasswordLoginUser({ user });
          return createLoginChallenge({
            userId: String(user._id),
            username: user.username,
            channel: loginVerification.channel,
            target: loginVerification.target,
            language,
            fastgpt_sem,
            session
          });
        }

        return completePasswordLogin({
          user,
          username,
          language,
          fastgpt_sem,
          session
        });
      }
    );

  const userForLock = await MongoUser.findOne({ username }, { _id: 1 }).lean();
  const loginResult = userForLock
    ? await withUserLock(String(userForLock._id), runLogin)
    : await runLogin();

  if ('status' in loginResult) {
    return loginResult;
  }

  return finishPasswordLogin({
    ...loginResult,
    username,
    req,
    res
  });
}

export default NextAPI(handler);
