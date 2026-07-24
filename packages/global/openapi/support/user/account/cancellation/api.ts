import { z } from 'zod';
import {
  AccountCancellationAllowedMethodSchema,
  AccountCancellationUnavailableReasonSchema
} from '../../../../../support/user/account/cancellation/type';

/* ============================================================================
 * API: 账号注销
 * Route: /proApi/support/user/account/cancellation/*
 * Method: GET/POST/DELETE
 * Description: 查询、验证、提交和取消当前登录账号的注销申请
 * Tags: ['Account Cancellation', 'Account Verification']
 * ============================================================================ */

const DateTimeSchema = z.iso.datetime({ offset: true });

export const AccountCancellationStatusResponseSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        status: z.literal('none').meta({ description: '当前没有注销申请', example: 'none' }),
        canRequestCancellation: z.boolean().meta({
          description: '是否允许发起注销申请',
          example: true
        }),
        maskedAccount: z
          .string()
          .meta({ description: '当前账号脱敏值', example: 'us***@example.com' }),
        unavailableReason: AccountCancellationUnavailableReasonSchema.optional().meta({
          description: '不可申请原因',
          example: 'verification_unavailable'
        })
      })
      .strict(),
    z
      .object({
        status: z
          .literal('pending')
          .meta({ description: '等待期或最终清理中', example: 'pending' }),
        maskedAccount: z
          .string()
          .meta({ description: '当前账号脱敏值', example: 'us***@example.com' }),
        requestedAt: DateTimeSchema.meta({
          description: '注销申请时间（UTC）',
          example: '2026-07-01T10:00:00.000Z'
        }),
        scheduledCancelAt: DateTimeSchema.optional().meta({
          description: '派生的计划清理时间（UTC）',
          example: '2026-07-16T16:00:00.000Z'
        }),
        canCancelCancellation: z.boolean().meta({ description: '当前是否允许取消', example: true })
      })
      .strict()
  ])
  .meta({ description: '账号注销公开状态' });
export type AccountCancellationStatusResponse = z.infer<
  typeof AccountCancellationStatusResponseSchema
>;

const CodeVerificationCreateSchema = z
  .object({
    method: z.literal('code').meta({ description: '邮箱或手机验证码', example: 'code' }),
    payload: z
      .object({
        captcha: z
          .string()
          .min(1)
          .max(64)
          .meta({ description: '图片验证码答案', example: 'A1B2C3' }),
        googleToken: z.string().max(4096).optional().meta({ description: 'reCAPTCHA token' })
      })
      .strict()
  })
  .strict();

const WechatVerificationCreateSchema = z
  .object({
    method: z.literal('wechat').meta({ description: '微信扫码验证', example: 'wechat' }),
    payload: z.object({}).strict()
  })
  .strict();

const OAuthCreatePayloadSchema = z
  .object({
    callbackUrl: z
      .url()
      .max(2048)
      .meta({ description: 'OAuth 回调地址', example: 'https://example.com/login/provider' }),
    isWecomWorkTerminal: z.boolean().optional().meta({ description: '是否来自企业微信工作台' })
  })
  .strict();

const OAuthCreateMethodSchemas = [
  'oauth/github',
  'oauth/google',
  'oauth/microsoft',
  'oauth/wecom',
  'oauth/sso'
] as const;

export const CreateAccountCancellationVerificationBodySchema = z.discriminatedUnion('method', [
  CodeVerificationCreateSchema,
  WechatVerificationCreateSchema,
  ...OAuthCreateMethodSchemas.map((method) =>
    z
      .object({
        method: z.literal(method).meta({ description: 'OAuth 验证方式', example: method }),
        payload: OAuthCreatePayloadSchema
      })
      .strict()
  )
] as [typeof CodeVerificationCreateSchema, typeof WechatVerificationCreateSchema, ...any[]]);
export type CreateAccountCancellationVerificationBody = z.infer<
  typeof CreateAccountCancellationVerificationBodySchema
>;

export const CreateAccountCancellationVerificationResponseSchema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('code'),
      sent: z.literal(true),
      maskedTarget: z
        .string()
        .meta({ description: '验证码接收目标脱敏值', example: 'us***@example.com' })
    })
    .strict(),
  z
    .object({
      method: z.literal('wechat'),
      code: z.string().min(16).meta({ description: '微信扫码 scene', example: 'scene-code' }),
      codeUrl: z
        .url()
        .meta({ description: '微信二维码地址', example: 'https://mp.weixin.qq.com/...' }),
      expiredAt: DateTimeSchema.optional().meta({ description: '二维码过期时间' })
    })
    .strict(),
  ...OAuthCreateMethodSchemas.map((method) =>
    z
      .object({
        method: z.literal(method),
        state: z.string().min(16).meta({ description: '一次性 OAuth state', example: 'state' }),
        url: z
          .url()
          .meta({ description: 'Provider 授权地址', example: 'https://provider.example/authorize' })
      })
      .strict()
  )
] as [any, any, ...any[]]);
export type CreateAccountCancellationVerificationResponse = z.infer<
  typeof CreateAccountCancellationVerificationResponseSchema
>;

const CodeSubmitSchema = z
  .object({
    method: z.literal('code'),
    payload: z
      .object({
        code: z.string().min(1).max(32).meta({ description: '验证码', example: '123456' })
      })
      .strict()
  })
  .strict();
const WechatSubmitSchema = z
  .object({
    method: z.literal('wechat'),
    payload: z
      .object({
        code: z
          .string()
          .min(1)
          .max(128)
          .meta({ description: '微信扫码 scene', example: 'scene-code' })
      })
      .strict()
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
const OAuthSubmitPayloadSchema = z.object({
  callbackUrl: z
    .url()
    .max(2048)
    .meta({ description: 'OAuth 回调地址', example: 'https://example.com/login/provider' }),
  code: z
    .string()
    .min(1)
    .max(4096)
    .meta({ description: 'Provider 授权 code', example: 'provider-code' }),
  state: z
    .string()
    .min(16)
    .max(256)
    .optional()
    .meta({ description: '一次性 state；仅旧 SSO 可省略' }),
  props: OAuthPropsSchema.optional().meta({ description: 'SSO 附加属性' })
});

export const SubmitAccountCancellationBodySchema = z.discriminatedUnion('method', [
  CodeSubmitSchema,
  WechatSubmitSchema,
  ...OAuthCreateMethodSchemas.map((method) =>
    z.object({ method: z.literal(method), payload: OAuthSubmitPayloadSchema }).strict()
  )
] as [typeof CodeSubmitSchema, typeof WechatSubmitSchema, ...any[]]);
export type SubmitAccountCancellationBody = z.infer<typeof SubmitAccountCancellationBodySchema>;

export const SubmitAccountCancellationResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('verificationPending') }).strict(),
  z
    .object({
      status: z.literal('pending'),
      requestedAt: DateTimeSchema,
      scheduledCancelAt: DateTimeSchema,
      canCancelCancellation: z.literal(true)
    })
    .strict()
]);
export type SubmitAccountCancellationResponse = z.infer<
  typeof SubmitAccountCancellationResponseSchema
>;

export const CancelAccountCancellationResponseSchema = z
  .undefined()
  .meta({ description: '取消成功' });
export type CancelAccountCancellationResponse = z.infer<
  typeof CancelAccountCancellationResponseSchema
>;

export { AccountCancellationAllowedMethodSchema };
