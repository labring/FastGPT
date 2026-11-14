import { randomBytes } from 'node:crypto';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { FastGPTSemType } from '@fastgpt/global/support/marketing/type';
import {
  AccountContactUsernameSchema,
  VerificationTtlSeconds,
  type AccountContactChannel,
  type VerificationMaterial
} from '@fastgpt/global/support/user/account/verification/type';
import {
  LoginVerificationCaptchaResponseSchema,
  LoginVerificationConfigResponseSchema,
  LoginVerificationResolveResponseSchema,
  LoginVerificationSendCodeResponseSchema,
  type LoginVerificationCaptchaResponseType,
  type LoginVerificationConfigResponseType,
  type LoginVerificationRequiredResponseType,
  type LoginVerificationResolveResponseType,
  type LoginVerificationSendCodeResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import { GET, POST } from '../../../../../thirdProvider/fastgptPro/plusRequest';
import { FastGPTProUrl } from '../../../../../common/system/constants';
import { assertCodeVerificationConsumeRateLimit } from '../../../../../common/rateLimit/interface/accountVerification';
import {
  getCodeVerificationKey,
  verification,
  VerificationMaterialError
} from '../../../../tmpData/verification';
import { maskAccount } from '../../utils';
import type { ClientSession } from '../../../../../common/mongo';
import { withUserLock } from '../../../lock';

export type LoginChallengeMaterial = VerificationMaterial<'loginChallenge'>;

type CreateLoginChallengeParams = {
  userId: string;
  username: string;
  channel: AccountContactChannel;
  target: string;
  language: LoginChallengeMaterial['language'];
  fastgpt_sem?: FastGPTSemType;
  session?: ClientSession;
};

type LoginVerificationHandler<T> = (params: {
  challenge: LoginChallengeMaterial;
  session: ClientSession;
}) => Promise<T>;

const LOGIN_CHALLENGE_TTL_PRESET = 'medium' as const;
const MAX_CHALLENGE_CREATION_ATTEMPTS = 3;

/** 登录只对邮箱和手机号账号请求 Pro 能力，普通用户名保持原有 fallback。 */
export const isLoginContactUsername = (username: string) =>
  AccountContactUsernameSchema.safeParse(username).success;

/**
 * 每次向 Pro 读取其部署环境中的登录二次验证开关；社区版未接入 Pro 时保持关闭。
 * 已配置 Pro 但请求或响应校验失败时向调用方传递错误，不能回落旧库值而绕过验证。
 */
export const isLoginVerificationEnabled = async () => {
  if (!FastGPTProUrl) return false;

  try {
    const config = await GET<LoginVerificationConfigResponseType>(
      '/support/user/account/login/verification/config'
    );
    return LoginVerificationConfigResponseSchema.parse(config).enabled;
  } catch {
    // 网络异常可能包含服务间令牌，响应校验异常也可能包含服务端数据；禁止交给公共登录日志。
    throw new Error('Login verification configuration is unavailable');
  }
};

/** 防止开关关闭后仍使用已经生成的登录 Challenge 完成二次验证。 */
const assertLoginVerificationEnabled = async () => {
  if (!(await isLoginVerificationEnabled())) {
    throw new UserError('Login two-factor verification is disabled');
  }
};

/** 请求 Pro 解析登录账号当前可用的邮箱或短信二次验证能力。 */
export const resolveLoginVerification = async ({
  username
}: {
  username: string;
}): Promise<LoginVerificationResolveResponseType> => {
  const result = await POST<LoginVerificationResolveResponseType>(
    '/support/user/account/login/verification/resolve',
    { username }
  );

  return LoginVerificationResolveResponseSchema.parse(result);
};

/**
 * 在预登录材料消费事务中创建一次性登录 Challenge。
 * 明文 Challenge 只返回给当前请求，tmp_datas 仅保存其 SHA-256 摘要。
 */
export const createLoginChallenge = async ({
  userId,
  username,
  channel,
  target,
  language,
  fastgpt_sem,
  session
}: CreateLoginChallengeParams): Promise<LoginVerificationRequiredResponseType> => {
  for (let attempt = 0; attempt < MAX_CHALLENGE_CREATION_ATTEMPTS; attempt += 1) {
    const challenge = randomBytes(32).toString('base64url');
    const challengeHash = hashStr(challenge);
    const expiredAt = new Date(
      Date.now() + VerificationTtlSeconds[LOGIN_CHALLENGE_TTL_PRESET] * 1000
    );
    const created = await verification.createIfInactive({
      scene: 'login',
      type: 'loginChallenge',
      key: challengeHash,
      data: {
        userId,
        username,
        method: 'code',
        channel,
        target,
        language,
        fastgpt_sem
      },
      ttlPreset: LOGIN_CHALLENGE_TTL_PRESET,
      session
    });

    if (created) {
      return {
        status: 'verificationRequired',
        challenge,
        method: 'code',
        channel,
        // 脱敏值由主服务基于 Challenge 材料里的 target 现算，只用于前端展示，不能作为验证依据
        maskedTarget: maskAccount(target),
        expiredAt: expiredAt.toISOString()
      };
    }
  }

  throw new Error('Failed to allocate login verification challenge');
};

/** 读取有效登录 Challenge，并统一把过期、串用和重复消费映射为验证码错误。 */
export const getLoginChallenge = async ({
  challenge,
  session
}: {
  challenge: string;
  session?: ClientSession;
}) => {
  const challengeHash = hashStr(challenge);
  const material = await verification.get({
    scene: 'login',
    type: 'loginChallenge',
    key: challengeHash,
    session
  });

  if (!material) {
    throw new UserError(UserErrEnum.invalidVerificationCode);
  }

  return { challengeHash, material };
};

/** 为有效登录 Challenge 获取图片验证码，Pro 只接收不可逆 Challenge 摘要。 */
export const createLoginVerificationCaptcha = async ({
  challenge
}: {
  challenge: string;
}): Promise<LoginVerificationCaptchaResponseType> => {
  await assertLoginVerificationEnabled();
  const { challengeHash } = await getLoginChallenge({ challenge });
  const result = await POST<LoginVerificationCaptchaResponseType>(
    '/support/user/account/login/verification/captcha',
    { challengeHash }
  );

  return LoginVerificationCaptchaResponseSchema.parse(result);
};

/** 由主仓库从 Challenge 恢复目标和渠道，再请求 Pro 投递登录验证码。 */
export const sendLoginVerificationCode = async ({
  challenge,
  captcha
}: {
  challenge: string;
  captcha: string;
}): Promise<LoginVerificationSendCodeResponseType> => {
  await assertLoginVerificationEnabled();
  const { challengeHash, material } = await getLoginChallenge({ challenge });
  const result = await POST<LoginVerificationSendCodeResponseType>(
    '/support/user/account/login/verification/sendCode',
    {
      challengeHash,
      target: material.target,
      channel: material.channel,
      captcha,
      lang: material.language
    }
  );

  return LoginVerificationSendCodeResponseSchema.parse(result);
};

/**
 * 在同一 Mongo 事务中消费登录 Challenge 和 Pro 创建的邮箱或短信验证码。
 * 验证码错误、Challenge 过期或并发重复提交均不会消费任何一份有效材料。
 */
export const consumeLoginVerification = async <T>(
  { challenge, code }: { challenge: string; code: string },
  handler: LoginVerificationHandler<T>
): Promise<T> => {
  await assertLoginVerificationEnabled();
  const { challengeHash, material } = await getLoginChallenge({ challenge });
  await assertCodeVerificationConsumeRateLimit({
    account: material.target,
    scene: 'login'
  });

  try {
    return await withUserLock(material.userId, () =>
      verification.consumeManyInTransaction(
        [
          {
            scene: 'login',
            type: 'loginChallenge',
            key: challengeHash
          },
          {
            scene: 'login',
            type: 'code',
            key: getCodeVerificationKey({ account: challengeHash, code }),
            match: { code: code.toLowerCase() }
          }
        ],
        async ({ materials, session }) =>
          handler({
            challenge: materials[0],
            session
          })
      )
    );
  } catch (error) {
    if (error instanceof VerificationMaterialError) {
      throw new UserError(UserErrEnum.invalidVerificationCode);
    }
    throw error;
  }
};
