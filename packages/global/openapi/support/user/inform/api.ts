import { z } from 'zod';
import { LanguageSchema } from '../../../../common/i18n/type';
import { UserAuthTypeEnum } from '../../../../support/user/auth/constants';
import { AccountContactUsernameSchema } from '../../../../support/user/account/verification/type';

const SendAuthCodeBodySchema = z
  .object({
    username: AccountContactUsernameSchema.meta({
      description: '接收验证码的邮箱或手机号',
      example: 'user@example.com'
    }),
    type: z.enum(UserAuthTypeEnum).meta({
      description: '验证码类型',
      example: UserAuthTypeEnum.register
    }),
    captcha: z.string().min(1).max(64).meta({
      description: '图片验证码答案',
      example: 'A1B2C3'
    }),
    lang: LanguageSchema.meta({
      description: '验证码消息语言',
      example: 'zh-CN'
    })
  })
  .strict();
export type SendAuthCodeBodyType = z.infer<typeof SendAuthCodeBodySchema>;

/** 注册验证码接口，purpose 由后端固定为 register。 */
export const SendRegisterAuthCodeBodySchema = SendAuthCodeBodySchema.extend({
  type: z.literal(UserAuthTypeEnum.register).meta({
    description: '验证码类型',
    example: UserAuthTypeEnum.register
  })
}).strict();
export type SendRegisterAuthCodeBodyType = z.infer<typeof SendRegisterAuthCodeBodySchema>;

/** 找回密码验证码接口，purpose 由后端固定为 forgetPassword。 */
export const SendForgetPasswordAuthCodeBodySchema = SendAuthCodeBodySchema.extend({
  type: z.literal(UserAuthTypeEnum.findPassword).meta({
    description: '验证码类型',
    example: UserAuthTypeEnum.findPassword
  })
}).strict();
export type SendForgetPasswordAuthCodeBodyType = z.infer<
  typeof SendForgetPasswordAuthCodeBodySchema
>;

/** 绑定通知账号验证码接口，purpose 由后端固定为 bindNotification。 */
export const SendBindNotificationAuthCodeBodySchema = SendAuthCodeBodySchema.extend({
  type: z.literal(UserAuthTypeEnum.bindNotification).meta({
    description: '验证码类型',
    example: UserAuthTypeEnum.bindNotification
  })
}).strict();
export type SendBindNotificationAuthCodeBodyType = z.infer<
  typeof SendBindNotificationAuthCodeBodySchema
>;

export const SendAuthCodeResponseSchema = z
  .object({
    message: z.string().meta({ description: '发送结果说明', example: '发送验证码成功' })
  })
  .strict();
export type SendAuthCodeResponseType = z.infer<typeof SendAuthCodeResponseSchema>;
