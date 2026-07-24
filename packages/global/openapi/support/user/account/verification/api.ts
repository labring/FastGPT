import { z } from 'zod';
import { LanguageSchema } from '../../../../../common/i18n/type';
import {
  AccountContactUsernameSchema,
  CodeAccountVerificationSceneSchema
} from '../../../../../support/user/account/verification/type';

export const GetAccountCaptchaQuerySchema = z
  .object({
    username: AccountContactUsernameSchema.meta({
      description: '待验证的邮箱或手机号',
      example: 'user@example.com'
    })
  })
  .strict();
export type GetAccountCaptchaQuery = z.infer<typeof GetAccountCaptchaQuerySchema>;

export const GetAccountCaptchaResponseSchema = z
  .object({
    captchaImage: z.string().startsWith('data:image/').meta({
      description: 'Data URL 格式的图片验证码'
    })
  })
  .strict();
export type GetAccountCaptchaResponse = z.infer<typeof GetAccountCaptchaResponseSchema>;

export const SendAccountVerificationCodeBodySchema = z
  .object({
    username: AccountContactUsernameSchema.meta({
      description: '接收验证码的邮箱或手机号',
      example: 'user@example.com'
    }),
    type: CodeAccountVerificationSceneSchema.meta({
      description: '验证码业务场景',
      example: 'register'
    }),
    googleToken: z.string().max(4096).default('').meta({
      description: '部署启用 reCAPTCHA 时由客户端取得的校验 token'
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
export type SendAccountVerificationCodeBody = z.infer<typeof SendAccountVerificationCodeBodySchema>;

export const SendAccountVerificationCodeResponseSchema = z
  .object({
    message: z.string().meta({ description: '发送结果说明' })
  })
  .strict();
export type SendAccountVerificationCodeResponse = z.infer<
  typeof SendAccountVerificationCodeResponseSchema
>;
