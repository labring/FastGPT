import { z } from 'zod';
import { LanguageSchema } from '../../../../../common/i18n/type';

/* ============================================================================
 * API: 更新用户账号信息
 * Route: PUT /api/support/user/account/update
 * Method: PUT
 * Description: 更新当前用户的头像、时区或语言偏好
 * Tags: ['用户账号', 'Write']
 * ============================================================================ */

export const UpdateUserAccountBodySchema = z.object({
  avatar: z.string().optional().meta({
    example: 'https://fastgpt.example.com/api/common/file/read/avatar.png?token=xxx',
    description: '用户头像地址；同时更新当前团队成员头像'
  }),
  timezone: z.string().optional().meta({
    example: 'Asia/Shanghai',
    description: '用户时区'
  }),
  language: LanguageSchema.optional().meta({
    example: 'zh-CN',
    description: '用户语言偏好'
  }),
  balance: z.number().optional().meta({
    example: 0,
    description: '已废弃的用户余额字段，仅为兼容旧客户端保留',
    deprecated: true
  })
});
export type UpdateUserAccountBody = z.infer<typeof UpdateUserAccountBodySchema>;

export const UpdateUserAccountResponseSchema = z.object({}).meta({
  example: {},
  description: '用户账号信息更新成功'
});
export type UpdateUserAccountResponse = z.infer<typeof UpdateUserAccountResponseSchema>;
