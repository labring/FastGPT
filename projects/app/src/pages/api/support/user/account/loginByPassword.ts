import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import {
  LoginByPasswordBodySchema,
  LoginByPasswordResponseSchema,
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
import { puzzleCaptchaService } from '@fastgpt/service/support/user/account/captcha/service';
import {
  getPasswordLoginCaptchaScope,
  loginRiskService
} from '@fastgpt/service/support/user/account/login/risk/service';
import { verification } from '@fastgpt/service/support/tmpData/verification';
import { UserError } from '@fastgpt/global/common/error/utils';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import { checkIPRateLimit } from '@fastgpt/service/common/rateLimit/interface/ip';

/**
 * 无可用二次验证时先执行风险拼图门槛，再验证预登录码和密码。
 * 实际进入二次验证的账号跳过风险拼图；两类 Challenge 均不创建登录会话或 Cookie。
 */
async function handler(
  req: ApiRequestProps<LoginByPasswordBodyType>,
  res: ApiResponseType
): Promise<LoginByPasswordResponseType> {
  const { username, password, code, language, fastgpt_sem, captcha, automated } = parseApiInput({
    req,
    bodySchema: LoginByPasswordBodySchema
  }).body;

  const loginVerification = await (async () => {
    // 先做无 IO 的用户名判断，再读开关，避免普通用户名登录也查一次配置
    if (!isLoginContactUsername(username)) return;
    if (!(await isLoginVerificationEnabled())) return;
    return resolveLoginVerification({ username });
  })();

  const ip = getClientIpFromRequest(req) ?? 'unknown';
  // 只有实际会进入二次验证的账号豁免风险拼图，不能仅凭配置开关跳过。
  if (loginVerification?.status !== 'supported') {
    const requiresCaptcha = await loginRiskService.requiresCaptcha({
      username,
      ip,
      userAgent: req.headers?.['user-agent'] ?? '',
      automated
    });
    const scopeKey = getPasswordLoginCaptchaScope(username);
    if (captcha) {
      // 在验证密码之前原子消费，密码错误也不能复用同一凭证重复猜测。
      const consumed = await verification.deleteIfMatch({
        scene: 'login',
        type: 'captcha',
        key: scopeKey,
        match: { code: captcha }
      });
      if (consumed.deletedCount !== 1) throw new UserError(UserErrEnum.invalidVerificationCode);
    } else if (requiresCaptcha) {
      if (!(await checkIPRateLimit({ id: 'puzzle-create', ip, limit: 30, seconds: 60 }))) {
        throw new UserError(UserErrEnum.verifyCodeTooFrequently);
      }
      return LoginByPasswordResponseSchema.parse({
        status: 'captchaRequired',
        captcha: await puzzleCaptchaService.create({ username, purpose: 'login', scopeKey })
      });
    }
  }

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
  const loginResult = await (async () => {
    try {
      return userForLock ? await withUserLock(String(userForLock._id), runLogin) : await runLogin();
    } catch (error) {
      const reason = error instanceof Error ? error.message : error;
      if (
        reason === UserErrEnum.account_psw_error ||
        reason === UserErrEnum.invalidVerificationCode
      ) {
        await loginRiskService.recordFailure({ username, ip });
      }
      throw error;
    }
  })();

  if ('status' in loginResult) {
    return LoginByPasswordResponseSchema.parse(loginResult);
  }

  return LoginByPasswordResponseSchema.parse(
    await finishPasswordLogin({
      ...loginResult,
      username,
      req,
      res
    })
  );
}

export default NextAPI(handler);
