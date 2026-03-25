import { z } from 'zod';

// ===== Update password by old password =====
export const UpdatePasswordByOldBodySchema = z
  .object({
    oldPsw: z.string().trim().min(1).meta({
      example: 'hashed_old_password',
      description: '旧密码（已加密）'
    }),
    newPsw: z.string().trim().min(1).meta({
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
export const UpdatePasswordByOldResponseSchema = z.any().meta({
  description: '用户信息'
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
    newPsw: z.string().trim().min(1).meta({
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

export const ResetExpiredPswResponseSchema = z.object({}).meta({
  description: '重置成功'
});
export type ResetExpiredPswResponseType = z.infer<typeof ResetExpiredPswResponseSchema>;

// ===== Find Password (update by code) =====
export const UpdatePasswordByCodeBodySchema = z.object({
  username: z.string().trim().min(1).meta({ description: '用户名' }),
  code: z.string().meta({ description: '验证码' }),
  password: z.string().trim().min(1).meta({ description: '新密码' }),
  tmbId: z.string().optional().meta({ description: '团队成员 ID（可选）' })
});

export type UpdatePasswordByCodeBodyType = z.infer<typeof UpdatePasswordByCodeBodySchema>;
