import { z } from 'zod';
import { OAuthEnum } from '../../../../../support/user/constant';
import { LanguageSchema } from '../../../../../common/i18n/type';
import { UserSchema } from '../../../../../support/user/type';
import { TeamTmbItemSchema } from '../../../../../support/user/team/type';
import {
  AccountLoginUsernameSchema,
  AccountContactChannelSchema,
  AccountContactUsernameSchema,
  AccountKindSchema,
  AccountPasswordSchema,
  AccountVerificationUnsupportedReasonSchema,
  ExternalAuthStringSchema,
  ShortAuthStringSchema
} from '../../../../../support/user/account/verification/type';
import { PublicAuthTrackRegisterParamsSchema } from '../common';
import { OpenObjectOpenApiMeta } from '../../../../../common/zod/openapi';

const OpenAPITeamTmbItemSchema = TeamTmbItemSchema.omit({
  permission: true
}).extend({
  permission: z.any().meta({
    ...OpenObjectOpenApiMeta,
    description: '团队权限实例。具体权限字段取决于团队角色配置。'
  })
});

export const OpenAPIUserSchema = UserSchema.omit({
  team: true,
  permission: true
}).extend({
  team: OpenAPITeamTmbItemSchema,
  permission: z.any().meta({
    ...OpenObjectOpenApiMeta,
    description: '用户权限实例。具体权限字段取决于团队角色配置。'
  })
});
export type OpenAPIUserType = z.infer<typeof OpenAPIUserSchema>;

export const LoginSuccessResponseSchema = z.object({
  user: OpenAPIUserSchema.meta({
    description: '用户详情'
  }),
  token: z.string().meta({
    example: 'eyJhbGciOiJIUzI1NiIs...',
    description: '登录令牌'
  })
});
export type LoginSuccessResponseType = z.infer<typeof LoginSuccessResponseSchema>;

export const LoginVerificationRequiredResponseSchema = z
  .object({
    status: z.literal('verificationRequired').meta({ description: '密码正确，需要二次验证' }),
    challenge: z.string().trim().min(1).max(128).meta({
      description: '登录二次验证 Challenge，仅在内存中短期使用',
      example: 'login-challenge-token'
    }),
    method: z.literal('code').meta({ description: '二次验证方式', example: 'code' }),
    channel: AccountContactChannelSchema,
    maskedTarget: z.string().meta({
      description: '验证码接收目标的脱敏值',
      example: 'us***@example.com'
    }),
    expiredAt: z.iso.datetime({ offset: true }).meta({
      description: 'Challenge 过期时间',
      example: '2026-01-02T00:05:00.000Z'
    })
  })
  .strict();
export type LoginVerificationRequiredResponseType = z.infer<
  typeof LoginVerificationRequiredResponseSchema
>;

export const LoginByPasswordResponseSchema = z.union([
  LoginSuccessResponseSchema,
  LoginVerificationRequiredResponseSchema
]);
export type LoginByPasswordResponseType = z.infer<typeof LoginByPasswordResponseSchema>;

/* ============================================================================
 * API: 登录二次验证内部协议
 * Routes: POST /api/support/user/account/login/verification/resolve
 *         POST /api/support/user/account/login/verification/captcha
 *         POST /api/support/user/account/login/verification/sendCode
 * Description: FastGPT app 与 Pro 之间的登录二次验证能力协议，仅供服务端调用。
 * Tags: ['User Login', 'Account Verification']
 * ============================================================================ */

export const LoginVerificationResolveBodySchema = z
  .object({
    username: AccountLoginUsernameSchema.meta({
      description: '登录用户名',
      example: 'user@example.com'
    })
  })
  .strict();
export type LoginVerificationResolveBodyType = z.infer<typeof LoginVerificationResolveBodySchema>;

export const LoginVerificationResolveResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('supported').meta({ description: '账号具备登录二次验证能力' }),
      // 能被支持的账号类型就是可投递验证码的联系方式，取值与 channel 完全一致，因此复用同一份声明
      accountKind: AccountContactChannelSchema.meta({
        description: '账号类型，登录二次验证只支持邮箱和手机号账号',
        example: 'email'
      }),
      method: z.literal('code').meta({ description: '二次验证方式', example: 'code' }),
      channel: AccountContactChannelSchema,
      target: AccountContactUsernameSchema.meta({
        description: '验证码实际接收目标',
        example: 'user@example.com'
      })
    })
    .strict(),
  z
    .object({
      status: z.literal('unsupported').meta({
        description: '账号当前不具备登录二次验证能力，主服务回退密码登录'
      }),
      accountKind: AccountKindSchema.meta({ description: '账号类型识别结果', example: 'email' }),
      unsupportedReason: AccountVerificationUnsupportedReasonSchema.meta({
        description: '不支持二次验证的原因',
        example: 'no_available_verification_method'
      })
    })
    .strict()
]);
export type LoginVerificationResolveResponseType = z.infer<
  typeof LoginVerificationResolveResponseSchema
>;

export const LoginVerificationChallengeBodySchema = z
  .object({
    challenge: z.string().trim().min(1).max(128).meta({
      description: '登录二次验证 Challenge',
      example: 'login-challenge-token'
    })
  })
  .strict();
export type LoginVerificationChallengeBodyType = z.infer<
  typeof LoginVerificationChallengeBodySchema
>;

export const LoginVerificationSendCodeBodySchema = LoginVerificationChallengeBodySchema.extend({
  captcha: ShortAuthStringSchema.max(64).meta({
    description: '图片验证码答案',
    example: 'A1B2C3'
  })
});
export type LoginVerificationSendCodeBodyType = z.infer<typeof LoginVerificationSendCodeBodySchema>;

export const LoginVerificationVerifyBodySchema = LoginVerificationChallengeBodySchema.extend({
  code: ShortAuthStringSchema.meta({
    description: '邮箱或手机验证码',
    example: '123456'
  })
});
export type LoginVerificationVerifyBodyType = z.infer<typeof LoginVerificationVerifyBodySchema>;

export const LoginVerificationCaptchaBodySchema = z
  .object({
    challengeHash: z
      .string()
      .length(64)
      .regex(/^[a-f0-9]+$/)
      .meta({
        description: 'Challenge 的 SHA-256 摘要',
        example: 'a'.repeat(64)
      })
  })
  .strict();
export type LoginVerificationCaptchaBodyType = z.infer<typeof LoginVerificationCaptchaBodySchema>;

export const LoginVerificationSendCodeInternalBodySchema =
  LoginVerificationCaptchaBodySchema.extend({
    target: AccountContactUsernameSchema.meta({
      description: '验证码接收目标，由主服务从 Challenge 材料解析',
      example: 'user@example.com'
    }),
    channel: AccountContactChannelSchema,
    captcha: ShortAuthStringSchema.max(64).meta({
      description: '图片验证码答案',
      example: 'A1B2C3'
    }),
    lang: LanguageSchema.meta({
      description: '验证码消息语言',
      example: 'zh-CN'
    })
  });
export type LoginVerificationSendCodeInternalBodyType = z.infer<
  typeof LoginVerificationSendCodeInternalBodySchema
>;

export const LoginVerificationCaptchaResponseSchema = z.object({
  captchaImage: z.string().meta({
    description: 'Base64 编码的图片验证码',
    example: 'data:image/png;base64,...'
  })
});
export type LoginVerificationCaptchaResponseType = z.infer<
  typeof LoginVerificationCaptchaResponseSchema
>;

export const LoginVerificationSendCodeResponseSchema = z.object({
  message: z.string().meta({ description: '发送结果说明', example: '发送验证码成功' })
});
export type LoginVerificationSendCodeResponseType = z.infer<
  typeof LoginVerificationSendCodeResponseSchema
>;

export const WxLoginExpiredResponseSchema = z.object({
  expired: z.literal(true).meta({
    description: '微信登录二维码是否已过期'
  })
});
export const WxLoginPendingResponseSchema = z.null().meta({
  description: '二维码仍在等待扫码'
});
export const WxLoginResultResponseSchema = z.union([
  LoginSuccessResponseSchema,
  WxLoginExpiredResponseSchema,
  WxLoginPendingResponseSchema
]);
export type WxLoginResultResponseType = z.infer<typeof WxLoginResultResponseSchema>;

// ===== Pre login - get login verification code =====
export const PreLoginQuerySchema = z.object({
  username: AccountLoginUsernameSchema.meta({
    example: 'admin',
    description: '用户名'
  })
});
export type PreLoginQueryType = z.infer<typeof PreLoginQuerySchema>;

export const PreLoginResponseSchema = z
  .object({
    code: z.string().meta({
      example: 'a1b2c3',
      description: '预登录验证码'
    })
  })
  .meta({
    example: {
      code: 'a1b2c3'
    }
  });
export type PreLoginResponseType = z.infer<typeof PreLoginResponseSchema>;

// ===== Login by password =====
export const LoginByPasswordBodySchema = PublicAuthTrackRegisterParamsSchema.extend({
  username: AccountLoginUsernameSchema.meta({
    example: 'admin',
    description: '用户名'
  }),
  password: AccountPasswordSchema.meta({
    example: 'hashed_password',
    description: '密码'
  }),
  code: ShortAuthStringSchema.meta({
    example: '123456',
    description: '预登录验证码'
  }),
  language: LanguageSchema.optional().default('zh-CN').meta({
    example: 'zh-CN',
    description: '用户语言偏好'
  })
}).meta({
  example: {
    username: 'admin',
    password: 'hashed_password',
    code: '123456',
    language: 'zh-CN'
  }
});
export type LoginByPasswordBodyType = z.infer<typeof LoginByPasswordBodySchema>;

/* ============================================================================
 * API: 获取企业微信登录跳转地址
 * Route: POST /api/proApi/support/user/account/login/wecom/getRedirectUrl
 * Method: POST
 * Description: 根据登录回调地址和当前终端环境生成企业微信 OAuth 跳转地址。
 * Tags: ['用户账号', 'Write']
 * ============================================================================ */

export const WecomGetRedirectURLBodySchema = z
  .object({
    redirectUri: ExternalAuthStringSchema.meta({
      example: 'https://fastgpt.example.com/login/provider',
      description: '企业微信登录完成后的回调地址'
    }),
    state: ShortAuthStringSchema.meta({
      example: 'a1b2c3d4',
      description: '登录流程状态值，用于校验回调请求'
    }),
    isWecomWorkTerminal: z.boolean().meta({
      example: false,
      description: '当前是否为企业微信工作台环境'
    })
  })
  .meta({
    example: {
      redirectUri: 'https://fastgpt.example.com/login/provider',
      state: 'a1b2c3d4',
      isWecomWorkTerminal: false
    }
  });
export const WecomGetRedirectURLResponseSchema = z.string().meta({
  example: 'https://open.weixin.qq.com/connect/oauth2/authorize?...',
  description: '企业微信 OAuth 授权跳转地址'
});
export type WecomGetRedirectURLBodyType = z.infer<typeof WecomGetRedirectURLBodySchema>;
export type WecomGetRedirectURLResponseType = z.infer<typeof WecomGetRedirectURLResponseSchema>;

/* ===== SSO Authorization URL ===== */
export const SsoGetAuthorizationURLBodySchema = z.object({
  redirectUri: ExternalAuthStringSchema.meta({
    example: 'https://fastgpt.example.com/login',
    description: 'SSO 登录完成后的回调地址'
  }),
  isWecomWorkTerminal: z.boolean().meta({
    example: false,
    description: '当前是否为企业微信工作台环境'
  })
});
export const SsoGetAuthorizationURLResponseSchema = z.string().meta({
  example: 'https://sso.example.com/oauth/authorize',
  description: 'SSO 授权跳转地址'
});
export type SsoGetAuthorizationURLBodyType = z.infer<typeof SsoGetAuthorizationURLBodySchema>;
export type SsoGetAuthorizationURLResponseType = z.infer<
  typeof SsoGetAuthorizationURLResponseSchema
>;

// ===== OAuth Login =====
export const OauthLoginBodySchema = PublicAuthTrackRegisterParamsSchema.extend({
  type: z.enum(OAuthEnum).meta({ description: 'OAuth 登录类型' }),
  callbackUrl: ExternalAuthStringSchema.meta({ description: '回调 URL' }),
  props: z
    .record(ExternalAuthStringSchema, ExternalAuthStringSchema)
    .meta({ description: '附加属性' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});
export type OauthLoginBodyType = z.infer<typeof OauthLoginBodySchema>;

// ===== Fast Login =====
export const FastLoginBodySchema = PublicAuthTrackRegisterParamsSchema.extend({
  token: ExternalAuthStringSchema.meta({ description: 'Token' }),
  code: ExternalAuthStringSchema.meta({ description: '外部快速登录配置键' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});
export type FastLoginBodyType = z.infer<typeof FastLoginBodySchema>;

// ===== WeChat Login Result =====
export const WxLoginBodySchema = PublicAuthTrackRegisterParamsSchema.extend({
  code: ShortAuthStringSchema.meta({ description: '微信登录 Code' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});
export type WxLoginBodyType = z.infer<typeof WxLoginBodySchema>;
export const GetWXLoginQRResponseSchema = z.object({
  code: z.string().meta({ description: '微信登录 Code' }),
  codeUrl: z.string().meta({ description: '微信登录二维码 URL' })
});
export type GetWXLoginQRResponseType = z.infer<typeof GetWXLoginQRResponseSchema>;
