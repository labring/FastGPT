import { z } from 'zod';
import { OAuthEnum } from '../../../../../support/user/constant';
import { TrackRegisterParamsSchema } from '../../../../../support/marketing/type';
import { LanguageSchema } from '../../../../../common/i18n/type';
import { UserSchema } from '../../../../../support/user/type';
import { TeamTmbItemSchema } from '../../../../../support/user/team/type';

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

// ===== Pre login - get login verification code =====
export const PreLoginQuerySchema = z.object({
  username: z.string().meta({
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
export const LoginByPasswordBodySchema = TrackRegisterParamsSchema.extend({
  username: z.string().meta({
    example: 'admin',
    description: '用户名'
  }),
  password: z.string().meta({
    example: 'hashed_password',
    description: '密码'
  }),
  code: z.string().meta({
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

/* ===== Wecom Login ===== */
export const WecomGetRedirectURLBodySchema = z.object({
  redirectUri: z.string(),
  state: z.string(),
  isWecomWorkTerminal: z.boolean()
});
export const WecomGetRedirectURLResponseSchema = z.string();
export type WecomGetRedirectURLBodyType = z.infer<typeof WecomGetRedirectURLBodySchema>;
export type WecomGetRedirectURLResponseType = z.infer<typeof WecomGetRedirectURLResponseSchema>;

/* ===== OAuth authorization start ===== */
export const OauthStartProviderSchema = z
  .enum([OAuthEnum.github, OAuthEnum.google, OAuthEnum.microsoft, OAuthEnum.wecom, OAuthEnum.sso])
  .meta({ description: 'OAuth 登录类型' });

export const OauthStartBodySchema = z.object({
  provider: OauthStartProviderSchema,
  redirectUri: z.string().meta({ description: 'OAuth 回调地址' }),
  isWecomWorkTerminal: z.boolean().optional().meta({ description: '是否为企业微信工作台终端' })
});
export type OauthStartBodyType = z.infer<typeof OauthStartBodySchema>;

export const OauthStartResponseSchema = z.object({
  state: z.string().optional().meta({ description: '服务端生成的 OAuth state' })
});
export type OauthStartResponseType = z.infer<typeof OauthStartResponseSchema>;

// ===== OAuth Login =====
export const OauthLoginBodySchema = TrackRegisterParamsSchema.extend({
  type: z.enum(OAuthEnum).meta({ description: 'OAuth 登录类型' }),
  callbackUrl: z.string().meta({ description: '回调 URL' }),
  props: z
    .record(z.string().regex(/^[A-Za-z0-9_.-]+$/), z.string())
    .meta({ description: '附加属性' }),
  state: z.string().optional().meta({ description: 'OAuth state' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});
export type OauthLoginBodyType = z.infer<typeof OauthLoginBodySchema>;

// ===== Fast Login =====
export const FastLoginBodySchema = TrackRegisterParamsSchema.extend({
  token: z.string().meta({ description: 'Token' }),
  code: z.string().meta({ description: 'Code' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});
export type FastLoginBodyType = z.infer<typeof FastLoginBodySchema>;

// ===== WeChat Login Result =====
export const WxLoginBodySchema = TrackRegisterParamsSchema.extend({
  code: z.string().meta({ description: '微信登录 Code' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});
export type WxLoginBodyType = z.infer<typeof WxLoginBodySchema>;
export const WxLoginResultResponseSchema = z.union([
  LoginSuccessResponseSchema,
  z.object({
    expired: z.literal(true).meta({ description: '二维码是否已过期' })
  })
]);
export type WxLoginResultResponseType = z.infer<typeof WxLoginResultResponseSchema>;
export const GetWXLoginQRResponseSchema = z.object({
  code: z.string().meta({ description: '微信登录 Code' }),
  codeUrl: z.string().meta({ description: '微信登录二维码 URL' })
});
export type GetWXLoginQRResponseType = z.infer<typeof GetWXLoginQRResponseSchema>;
