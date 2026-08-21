import { z } from 'zod';
import { OAuthEnum } from '../../../../../support/user/constant';
import { LanguageSchema } from '../../../../../common/i18n/type';
import { UserSchema } from '../../../../../support/user/type';
import { TeamTmbItemSchema } from '../../../../../support/user/team/type';
import {
  AccountLoginUsernameSchema,
  AccountPasswordSchema,
  ExternalAuthStringSchema,
  ShortAuthStringSchema
} from '../../../../../support/user/account/verification/type';
import { PublicAuthTrackRegisterParamsSchema } from '../common';

const OpenAPITeamTmbItemSchema = TeamTmbItemSchema.omit({
  permission: true
}).extend({
  permission: z.any().meta({
    description: '团队权限实例。返回值为服务端权限对象，文档中按任意结构展示。'
  })
});

export const OpenAPIUserSchema = UserSchema.omit({
  team: true,
  permission: true
}).extend({
  team: OpenAPITeamTmbItemSchema,
  permission: z.any().meta({
    description: '用户权限实例。返回值为服务端权限对象，文档中按任意结构展示。'
  })
});

export const LoginSuccessResponseSchema = z.object({
  user: z.any().meta({
    description: '用户详情'
  }),
  token: z.string().meta({
    example: 'eyJhbGciOiJIUzI1NiIs...',
    description: '登录令牌'
  })
});
export type LoginSuccessResponseType = z.infer<typeof LoginSuccessResponseSchema>;

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
