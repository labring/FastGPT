import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { serviceEnv } from '../../../../env';
import { MongoUser } from '../../schema';
import { resolveAccountKindByUsername } from '@fastgpt/global/support/user/account/verification/utils';

export const PASSWORD_CHANGE_TOKEN_TTL_SECONDS = 5 * 60;

/** 当前运行时是否开启 SSO 用户禁用密码策略。 */
export const isSsoPasswordDisabled = () =>
  Boolean(global.feConfigs?.sso?.url) && global.feConfigs?.sso?.disablePasswordForSsoUsers === true;

/** 使用共享账号分类规则判断持久化 username 是否属于当前 SSO 环境。 */
export const isSsoUserByUsername = (username: string) =>
  resolveAccountKindByUsername({
    username,
    ssoConfigured: Boolean(global.feConfigs?.sso?.url)
  }) === 'sso';

/** 返回当前运行时中指定账号是否允许使用或维护平台密码。 */
export const getUserPasswordAvailability = (username: string) =>
  !(isSsoPasswordDisabled() && isSsoUserByUsername(username));

/** 在密码比对或最终写入前拒绝受限 SSO 用户。 */
export const assertUserPasswordAvailable = (username: string) => {
  if (!getUserPasswordAvailability(username)) {
    throw new UserError(UserErrEnum.ssoPasswordUnavailable);
  }
};

export const PasswordChangeTokenPayloadSchema = z
  .object({
    userId: z.string().min(1),
    purpose: z.literal('changePassword'),
    iat: z.number().int(),
    exp: z.number().int()
  })
  .strict();
export type PasswordChangeTokenPayload = z.infer<typeof PasswordChangeTokenPayloadSchema>;

type PasswordChangeTokenDependencies = {
  secret: string;
  now: () => Date;
};

/**
 * 签发和校验修改密码专用 JWT。共享签名密钥不扩大 Token 用途，校验始终强制
 * `purpose=changePassword`、HS256、固定有效期和当前 Session 用户一致。
 */
export class PasswordChangeTokenService {
  private readonly dependencies: PasswordChangeTokenDependencies;

  constructor(dependencies: Partial<PasswordChangeTokenDependencies> = {}) {
    this.dependencies = {
      secret: serviceEnv.JWT_SECRET,
      now: () => new Date(),
      ...dependencies
    };
  }

  sign(userId: string) {
    const issuedAt = Math.floor(this.dependencies.now().getTime() / 1000);
    const expiredAt = new Date((issuedAt + PASSWORD_CHANGE_TOKEN_TTL_SECONDS) * 1000);
    const token = jwt.sign(
      {
        userId,
        purpose: 'changePassword',
        iat: issuedAt
      },
      this.dependencies.secret,
      {
        algorithm: 'HS256',
        expiresIn: PASSWORD_CHANGE_TOKEN_TTL_SECONDS
      }
    );

    return { token, expiredAt };
  }

  verify({ token, userId }: { token: string; userId: string }): PasswordChangeTokenPayload {
    try {
      const payload = PasswordChangeTokenPayloadSchema.parse(
        jwt.verify(token, this.dependencies.secret, {
          algorithms: ['HS256'],
          clockTimestamp: Math.floor(this.dependencies.now().getTime() / 1000)
        })
      );
      if (payload.userId !== userId) {
        throw new Error('Password change token user mismatch');
      }
      return payload;
    } catch {
      throw new UserError(UserErrEnum.passwordChangeAuthorizationInvalid);
    }
  }
}

export const passwordChangeTokenService = new PasswordChangeTokenService();

/**
 * 阻止用户侧改密流程复用当前密码。密码查询交由 Mongoose schema setter 处理，
 * 以兼容客户端摘要和数据库持久化摘要的现有双层哈希协议。
 */
export const assertNewPasswordDiffersFromCurrent = async ({
  userId,
  newPassword
}: {
  userId: string;
  newPassword: string;
}) => {
  const isSamePassword = await MongoUser.exists({ _id: userId, password: newPassword });
  if (isSamePassword) {
    throw new UserError(UserErrEnum.newPasswordSameAsOld);
  }
};
