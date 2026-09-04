import { z } from 'zod';
import { LanguageSchema } from '../../../../../common/i18n/type';
import {
  AccountContactUsernameSchema,
  AccountPasswordSchema,
  AccountVerificationMethodSchema,
  ShortAuthStringSchema,
  type OAuthAccountVerificationMethod
} from '../../../../../support/user/account/verification/type';
import { oauthAccountVerificationMethods } from '../../../../../support/user/account/verification/constants';

/* ============================================================================
 * API: 安全修改密码
 * Routes: POST /proApi/support/user/account/password/verification/create
 *         POST /proApi/support/user/account/password/authorization
 *         POST /support/user/account/password/update
 * Description: 创建身份验证材料、一次性改密 Session 并更新当前用户密码
 * Tags: ['User Login', 'Account Verification']
 * ============================================================================ */

// ===== Check password expired =====
export const CheckPswExpiredResponseSchema = z.boolean().meta({
  example: false,
  description: '密码是否已过期'
});
export type CheckPswExpiredResponseType = z.infer<typeof CheckPswExpiredResponseSchema>;

const DateTimeSchema = z.iso.datetime({ offset: true });
const createOAuthVerificationSchemaTuple = <Schema extends z.ZodType>(
  createSchema: (method: OAuthAccountVerificationMethod) => Schema
) => oauthAccountVerificationMethods.map(createSchema) as [Schema, Schema, Schema, Schema, Schema];

const OAuthCreatePayloadSchema = z
  .object({
    callbackUrl: z.url().max(2048).meta({
      description: 'OAuth 回调地址',
      example: 'https://fastgpt.example.com/login/provider'
    }),
    isWecomWorkTerminal: z.boolean().optional().meta({
      description: '是否来自企业微信工作台',
      example: false
    })
  })
  .strict();
const OAuthPropsSchema = z
  .record(
    z
      .string()
      .regex(/^[A-Za-z0-9_.-]+$/)
      .max(64),
    z.string().max(4096)
  )
  .refine((props) => Object.keys(props).length <= 20, {
    message: 'OAuth props contain too many keys'
  });
const OAuthConsumePayloadSchema = z
  .object({
    callbackUrl: z.url().max(2048).meta({
      description: 'OAuth 回调地址',
      example: 'https://fastgpt.example.com/login/provider'
    }),
    code: z.string().min(1).max(4096).meta({
      description: 'Provider 返回的一次性授权码',
      example: 'provider-code'
    }),
    state: z.string().min(16).max(256).optional().meta({
      description: '创建验证材料时签发的 OAuth state',
      example: 'state-abcdefghijklmnopqrstuvwxyz'
    }),
    props: OAuthPropsSchema.optional().meta({ description: 'SSO Provider 附加回调参数' })
  })
  .strict();

const CodeVerificationCreateSchema = z
  .object({
    method: z.literal('code').meta({ description: '邮箱或手机验证码', example: 'code' }),
    payload: z
      .object({
        captcha: z.string().min(1).max(64).meta({
          description: '图片验证码答案',
          example: 'A1B2C3'
        })
      })
      .strict()
  })
  .strict();
const OldPasswordVerificationCreateSchema = z
  .object({
    method: z.literal('oldPassword'),
    payload: z.object({}).strict()
  })
  .strict();
const WechatVerificationCreateSchema = z
  .object({
    method: z.literal('wechat'),
    payload: z.object({}).strict()
  })
  .strict();
const OAuthVerificationCreateSchemas = createOAuthVerificationSchemaTuple((method) =>
  z.object({ method: z.literal(method), payload: OAuthCreatePayloadSchema }).strict()
);

export const CreatePasswordVerificationBodySchema = z.discriminatedUnion('method', [
  CodeVerificationCreateSchema,
  OldPasswordVerificationCreateSchema,
  WechatVerificationCreateSchema,
  ...OAuthVerificationCreateSchemas
]);
export type CreatePasswordVerificationBody = z.infer<typeof CreatePasswordVerificationBodySchema>;

const OAuthVerificationResponseSchemas = createOAuthVerificationSchemaTuple((method) =>
  z.object({
    method: z.literal(method),
    state: z.string().min(16).meta({ description: 'OAuth state', example: 'state-value' }),
    url: z.url().meta({ description: 'Provider 重新认证地址' })
  })
);
export const CreatePasswordVerificationResponseSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('code'),
    sent: z.literal(true),
    maskedTarget: z.string().meta({ description: '验证码接收目标脱敏值' })
  }),
  z.object({
    method: z.literal('oldPassword'),
    preLoginCode: z.string().min(1).meta({ description: '绑定当前密码验证的短期材料' })
  }),
  z.object({
    method: z.literal('wechat'),
    code: z.string().min(16).meta({ description: '微信二维码场景码' }),
    codeUrl: z.url().meta({ description: '微信二维码图片地址' }),
    expiredAt: DateTimeSchema.optional().meta({ description: '二维码过期时间' })
  }),
  ...OAuthVerificationResponseSchemas
]);
export type CreatePasswordVerificationResponse = z.infer<
  typeof CreatePasswordVerificationResponseSchema
>;

const CodeVerificationConsumeSchema = z
  .object({
    method: z.literal('code'),
    payload: z.object({ code: z.string().min(1).max(32) }).strict()
  })
  .strict();
const OldPasswordVerificationConsumeSchema = z
  .object({
    method: z.literal('oldPassword'),
    payload: z
      .object({
        password: z.string().length(64),
        preLoginCode: z.string().min(1).max(128)
      })
      .strict()
  })
  .strict();
const WechatVerificationConsumeSchema = z
  .object({
    method: z.literal('wechat'),
    payload: z.object({ code: z.string().min(1).max(128) }).strict()
  })
  .strict();
const OAuthVerificationConsumeSchemas = createOAuthVerificationSchemaTuple((method) =>
  z.object({ method: z.literal(method), payload: OAuthConsumePayloadSchema }).strict()
);
export const SensitiveAccountVerificationBodySchema = z.discriminatedUnion('method', [
  CodeVerificationConsumeSchema,
  OldPasswordVerificationConsumeSchema,
  WechatVerificationConsumeSchema,
  ...OAuthVerificationConsumeSchemas
]);
export type SensitiveAccountVerificationBody = z.infer<
  typeof SensitiveAccountVerificationBodySchema
>;

export const PasswordAuthorizationBodySchema = z.discriminatedUnion('source', [
  z
    .object({
      source: z.literal('verificationMethod').meta({
        description: '请求服务端解析唯一验证方式',
        example: 'verificationMethod'
      })
    })
    .strict(),
  z
    .object({
      source: z.literal('accountVerification').meta({
        description: '消费账号身份验证材料',
        example: 'accountVerification'
      }),
      verification: SensitiveAccountVerificationBodySchema.meta({ description: '身份验证材料' })
    })
    .strict()
]);
export type PasswordAuthorizationBody = z.infer<typeof PasswordAuthorizationBodySchema>;

export const PasswordAuthorizationResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('authorized'),
    sessionId: z.string().min(1).max(128).meta({ description: '五分钟有效的一次性改密 Session' }),
    expiredAt: DateTimeSchema.meta({ description: '改密授权过期时间' })
  }),
  z.object({
    status: z.literal('verificationRequired'),
    method: AccountVerificationMethodSchema.meta({ description: '服务端选择的唯一验证方式' })
  }),
  z.object({ status: z.literal('verificationPending') }),
  z.object({ status: z.literal('verificationExpired') }),
  z.object({
    status: z.literal('verificationUnavailable'),
    reason: z.literal('no_available_verification_method')
  })
]);
export type PasswordAuthorizationResponse = z.infer<typeof PasswordAuthorizationResponseSchema>;

export const UpdatePasswordBodySchema = z
  .object({
    newPsw: z
      .string()
      .length(64)
      .meta({
        description: '客户端 SHA-256 处理后的新密码摘要',
        example: 'a'.repeat(64)
      }),
    passwordChangeSession: z.string().min(1).max(128).meta({
      description: '身份验证成功后签发的一次性改密 Session',
      example: 'password-change-session'
    })
  })
  .strict();
export type UpdatePasswordBody = z.infer<typeof UpdatePasswordBodySchema>;

export const UpdatePasswordResponseSchema = z.undefined().meta({ description: '密码设置成功' });
export type UpdatePasswordResponse = z.infer<typeof UpdatePasswordResponseSchema>;

// ===== Find Password (update by code) =====
export const UpdatePasswordByCodeBodySchema = z.object({
  username: AccountContactUsernameSchema.meta({ description: '用户名（邮箱或手机号）' }),
  code: ShortAuthStringSchema.meta({ description: '验证码' }),
  password: AccountPasswordSchema.meta({ description: '新密码' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});

export type UpdatePasswordByCodeBodyType = z.infer<typeof UpdatePasswordByCodeBodySchema>;
