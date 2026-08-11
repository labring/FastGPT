import { z } from 'zod';
import { LanguageSchema } from '../../../../../common/i18n/type';
import {
  AccountContactUsernameSchema,
  AccountPasswordSchema,
  ShortAuthStringSchema
} from '../../../../../support/user/account/verification/type';

// ===== Update password by old password =====
export const UpdatePasswordByOldBodySchema = z
  .object({
    oldPsw: AccountPasswordSchema.meta({
      example: 'hashed_old_password',
      description: '旧密码（已加密）'
    }),
    newPsw: AccountPasswordSchema.meta({
      example: 'hashed_new_password',
      description: '新密码（已加密）'
    })
  })
  .meta({
    example: {
      oldPsw: 'hashed_old_password',
      newPsw: 'hashed_new_password'
    }
  });
export type UpdatePasswordByOldBodyType = z.infer<typeof UpdatePasswordByOldBodySchema>;
export const UpdatePasswordByOldResponseSchema = z.undefined().meta({
  description: '密码更新成功'
});
export type UpdatePasswordByOldResponseType = z.infer<typeof UpdatePasswordByOldResponseSchema>;

// ===== Check password expired =====
export const CheckPswExpiredResponseSchema = z.boolean().meta({
  example: false,
  description: '密码是否已过期'
});
export type CheckPswExpiredResponseType = z.infer<typeof CheckPswExpiredResponseSchema>;

// ===== Reset expired password =====
export const ResetExpiredPswBodySchema = z
  .object({
    newPsw: AccountPasswordSchema.meta({
      example: 'hashed_new_password',
      description: '新密码（已加密）'
    })
  })
  .meta({
    example: {
      newPsw: 'hashed_new_password'
    }
  });
export type ResetExpiredPswBodyType = z.infer<typeof ResetExpiredPswBodySchema>;

export const ResetExpiredPswResponseSchema = z.undefined().meta({
  description: '重置成功'
});
export type ResetExpiredPswResponseType = z.infer<typeof ResetExpiredPswResponseSchema>;

// ===== Find Password (update by code) =====
export const UpdatePasswordByCodeBodySchema = z.object({
  username: AccountContactUsernameSchema.meta({ description: '用户名（邮箱或手机号）' }),
  code: ShortAuthStringSchema.meta({ description: '验证码' }),
  password: AccountPasswordSchema.meta({ description: '新密码' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});

export type UpdatePasswordByCodeBodyType = z.infer<typeof UpdatePasswordByCodeBodySchema>;
