import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { serviceEnv } from '../../../../env';

export const PASSWORD_CHANGE_TOKEN_TTL_SECONDS = 5 * 60;

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
