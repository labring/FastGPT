import { z } from 'zod';
import { LanguageSchema } from '../../../../common/i18n/type';
import { VerificationCodeTypeEnum } from '../../../../support/user/account/verification/constants';
import {
  AccountContactUsernameSchema,
  ShortAuthStringSchema,
  VERIFICATION_CODE_PURPOSES_BY_TYPE
} from '../../../../support/user/account/verification/type';

const SendAuthCodeCommonSchema = z
  .object({
    username: AccountContactUsernameSchema.meta({
      description: '接收验证码的邮箱或手机号',
      example: 'user@example.com'
    }),
    captcha: ShortAuthStringSchema.max(64).meta({
      description: '图片验证码答案',
      example: 'A1B2C3'
    }),
    lang: LanguageSchema.meta({
      description: '验证码消息语言',
      example: 'zh-CN'
    })
  })
  .strict();

export const SendAuthCodeBodySchema = z.discriminatedUnion('type', [
  SendAuthCodeCommonSchema.extend({
    type: z.literal(VerificationCodeTypeEnum.register).meta({
      description: '验证码类型',
      example: VerificationCodeTypeEnum.register
    }),
    purpose: z.literal(VERIFICATION_CODE_PURPOSES_BY_TYPE[VerificationCodeTypeEnum.register]).meta({
      description: '验证码业务场景',
      example: 'register'
    })
  }).strict(),
  SendAuthCodeCommonSchema.extend({
    type: z.literal(VerificationCodeTypeEnum.findPassword).meta({
      description: '验证码类型',
      example: VerificationCodeTypeEnum.findPassword
    }),
    purpose: z
      .literal(VERIFICATION_CODE_PURPOSES_BY_TYPE[VerificationCodeTypeEnum.findPassword])
      .meta({
        description: '验证码业务场景',
        example: 'forgetPassword'
      })
  }).strict(),
  SendAuthCodeCommonSchema.extend({
    type: z.literal(VerificationCodeTypeEnum.bindNotification).meta({
      description: '验证码类型',
      example: VerificationCodeTypeEnum.bindNotification
    }),
    purpose: z
      .literal(VERIFICATION_CODE_PURPOSES_BY_TYPE[VerificationCodeTypeEnum.bindNotification])
      .meta({
        description: '验证码业务场景',
        example: 'bindNotification'
      })
  }).strict()
]);
export type SendAuthCodeBodyType = z.infer<typeof SendAuthCodeBodySchema>;

export const SendAuthCodeResponseSchema = z
  .object({
    message: z.string().meta({ description: '发送结果说明', example: '发送验证码成功' })
  })
  .strict();
export type SendAuthCodeResponseType = z.infer<typeof SendAuthCodeResponseSchema>;
