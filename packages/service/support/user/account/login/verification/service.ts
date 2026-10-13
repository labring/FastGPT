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
  LoginVerificationResolveResponseSchema,
  LoginVerificationSendCodeResponseSchema,
  type LoginVerificationCaptchaResponseType,
  type LoginVerificationRequiredResponseType,
  type LoginVerificationResolveResponseType,
  type LoginVerificationSendCodeResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import { POST } from '../../../../../thirdProvider/fastgptPro/plusRequest';
import { assertCodeVerificationConsumeRateLimit } from '../../../../../common/rateLimit/interface/accountVerification';
import { MongoSystemConfigs } from '../../../../../common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
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
 * 读取登录二次验证开关。开关只在 Pro 侧通过 LOGIN_2FA_ENABLED 配置，Pro 在启动归一化和保存
 * 配置时写入共享 feConfigs；开源版没有 Pro 下发，配置缺失即视为关闭。
 *
 * 这里直接查库而不是读 global.feConfigs：主服务的内存配置只在启动和 Mongo change stream
 * 触发时刷新，watch 未建立或不可用时会长期读到旧值，出现“环境变量已关闭但登录仍要求验证”。
 * 密码登录本身受频率限制且需要跑密码散列，多一次按 type 索引的查询开销可以忽略。
 */
export const isLoginVerificationEnabled = async () => {
  const config = await MongoSystemConfigs.findOne({
    type: SystemConfigsTypeEnum.fastgpt
  })
    .sort({ createTime: -1 })
    .lean();

  return config?.value?.feConfigs?.login2faEnabled === true;
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
