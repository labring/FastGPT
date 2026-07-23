import { z } from 'zod';
import { LanguageSchema } from '../../../../../common/i18n/type';
import {
  AccountContactUsernameSchema,
  AccountVerificationMethodSchema
} from '../../../../../support/user/account/verification/type';

const DateTimeSchema = z.iso.datetime({ offset: true });
const OAuthVerificationMethods = [
  'oauth/github',
  'oauth/google',
  'oauth/microsoft',
  'oauth/wecom',
  'oauth/sso'
] as const;
type OAuthVerificationMethod = (typeof OAuthVerificationMethods)[number];

/** 将固定的 OAuth 验证方式展开为静态 tuple，避免动态数组擦除 union 的 schema 类型。 */
const createOAuthVerificationSchemaTuple = <Schema extends z.ZodType>(
  createSchema: (method: OAuthVerificationMethod) => Schema
) =>
  [
    createSchema(OAuthVerificationMethods[0]),
    createSchema(OAuthVerificationMethods[1]),
    createSchema(OAuthVerificationMethods[2]),
    createSchema(OAuthVerificationMethods[3]),
    createSchema(OAuthVerificationMethods[4])
  ] as const;

const OAuthCreatePayloadSchema = z
  .object({
    callbackUrl: z.url().max(2048),
    isWecomWorkTerminal: z.boolean().optional()
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
    callbackUrl: z.url().max(2048),
    code: z.string().min(1).max(4096),
    state: z.string().min(16).max(256).optional(),
    props: OAuthPropsSchema.optional()
  })
  .strict();

const CodeVerificationCreateSchema = z
  .object({
    method: z.literal('code'),
    payload: z
      .object({
        captcha: z.string().min(1).max(64),
        googleToken: z.string().max(4096).optional()
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
  z
    .object({
      method: z.literal(method),
      payload: OAuthCreatePayloadSchema
    })
    .strict()
);

export const CreatePasswordVerificationBodySchema = z.discriminatedUnion('method', [
  CodeVerificationCreateSchema,
  OldPasswordVerificationCreateSchema,
  WechatVerificationCreateSchema,
  ...OAuthVerificationCreateSchemas
]);
export type CreatePasswordVerificationBody = z.infer<typeof CreatePasswordVerificationBodySchema>;

const OAuthVerificationResponseSchemas = createOAuthVerificationSchemaTuple((method) =>
  z
    .object({
      method: z.literal(method),
      state: z.string().min(16),
      url: z.url()
    })
    .strict()
);

export const CreatePasswordVerificationResponseSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('code'), sent: z.literal(true), maskedTarget: z.string() }).strict(),
  z.object({ method: z.literal('oldPassword'), preLoginCode: z.string().min(1) }).strict(),
  z
    .object({
      method: z.literal('wechat'),
      code: z.string().min(16),
      codeUrl: z.url(),
      expiredAt: DateTimeSchema.optional()
    })
    .strict(),
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
  z
    .object({
      method: z.literal(method),
      payload: OAuthConsumePayloadSchema
    })
    .strict()
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
  z.object({ source: z.literal('verificationMethod') }).strict(),
  z
    .object({
      source: z.literal('accountVerification'),
      verification: SensitiveAccountVerificationBodySchema
    })
    .strict()
]);
export type PasswordAuthorizationBody = z.infer<typeof PasswordAuthorizationBodySchema>;

export const PasswordAuthorizationResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('authorized'),
      token: z.string().min(1).max(4096),
      expiredAt: DateTimeSchema
    })
    .strict(),
  z
    .object({
      status: z.literal('verificationRequired'),
      method: AccountVerificationMethodSchema
    })
    .strict(),
  z.object({ status: z.literal('verificationPending') }).strict(),
  z
    .object({
      status: z.literal('verificationUnavailable'),
      reason: z.literal('no_available_verification_method')
    })
    .strict()
]);
export type PasswordAuthorizationResponse = z.infer<typeof PasswordAuthorizationResponseSchema>;

export const UpdatePasswordBodySchema = z
  .object({
    newPsw: z.string().length(64).meta({
      description: '沿用现有客户端 SHA-256 协议的新密码摘要'
    }),
    passwordChangeToken: z.string().min(1).max(4096)
  })
  .strict();
export type UpdatePasswordBody = z.infer<typeof UpdatePasswordBodySchema>;

export const UpdatePasswordResponseSchema = z.undefined().meta({ description: '密码设置成功' });
export type UpdatePasswordResponse = z.infer<typeof UpdatePasswordResponseSchema>;

export const CheckPswExpiredResponseSchema = z.boolean().meta({
  example: false,
  description: '密码是否已过期'
});
export type CheckPswExpiredResponseType = z.infer<typeof CheckPswExpiredResponseSchema>;

export const UpdatePasswordByCodeBodySchema = z
  .object({
    username: AccountContactUsernameSchema.meta({ description: '用户名（邮箱或手机号）' }),
    code: z.string().length(6).meta({ description: '验证码' }),
    password: z.string().trim().min(1).max(512).meta({ description: '新密码' }),
    tmbId: z.string().optional().meta({ description: '团队成员 ID（可选）' }),
    language: LanguageSchema.optional().meta({ description: '语言' })
  })
  .strict();
export type UpdatePasswordByCodeBodyType = z.infer<typeof UpdatePasswordByCodeBodySchema>;
