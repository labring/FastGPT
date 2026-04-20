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
export const LoginByPasswordBodySchema = z
  .object({
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
  })
  .meta({
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

// ===== OAuth Login =====
export const OauthLoginBodySchema = TrackRegisterParamsSchema.extend({
  type: z.enum(OAuthEnum).meta({ description: 'OAuth 登录类型' }),
  callbackUrl: z.string().meta({ description: '回调 URL' }),
  props: z.record(z.string(), z.string()).meta({ description: '附加属性' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});
export type OauthLoginBodyType = z.infer<typeof OauthLoginBodySchema>;

// ===== Fast Login =====
export const FastLoginBodySchema = z.object({
  token: z.string().meta({ description: 'Token' }),
  code: z.string().meta({ description: 'Code' })
});
export type FastLoginBodyType = z.infer<typeof FastLoginBodySchema>;

// ===== WeChat Login Result =====
export const WxLoginBodySchema = z.object({
  inviterId: z.string().optional().meta({ description: '邀请人 ID' }),
  code: z.string().meta({ description: '微信登录 Code' }),
  bd_vid: z.string().optional(),
  msclkid: z.string().optional(),
  fastgpt_sem: z.string().optional(),
  sourceDomain: z.string().optional()
});
export type WxLoginBodyType = z.infer<typeof WxLoginBodySchema>;
export const GetWXLoginQRResponseSchema = z.object({
  code: z.string().meta({ description: '微信登录 Code' }),
  codeUrl: z.string().meta({ description: '微信登录二维码 URL' })
});
export type GetWXLoginQRResponseType = z.infer<typeof GetWXLoginQRResponseSchema>;
