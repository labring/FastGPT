import { z } from 'zod';
import { TrackRegisterParamsSchema } from '../../../../../support/marketing/type';
import { LanguageSchema } from '../../../../../common/i18n/type';
import { UserSchema } from '../../../../../support/user/type';
import { TeamTmbItemSchema } from '../../../../../support/user/team/type';
import { OAuthAccountVerificationProviderSchema } from '../../../../../support/user/account/verification/type';

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
export const PreLoginQuerySchema = z
  .object({
    username: z.string().meta({
      example: 'admin',
      description: '用户名'
    })
  })
  .strict();
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
  })
  .strict();
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
})
  .meta({
    example: {
      username: 'admin',
      password: 'hashed_password',
      code: '123456',
      language: 'zh-CN'
    }
  })
  .strict();
export type LoginByPasswordBodyType = z.infer<typeof LoginByPasswordBodySchema>;

/* ============================================================================
 * API: 创建 OAuth 登录
 * Route: POST /proApi/support/user/account/login/oauth/create
 * Method: POST
 * Description: 创建 OAuth/SSO 登录 state 并返回 Provider 授权地址
 * Tags: ['Account Verification', 'User', 'Write']
 * ============================================================================ */
export const CreateOauthLoginBodySchema = z
  .object({
    provider: OAuthAccountVerificationProviderSchema.meta({ description: 'OAuth Provider' }),
    callbackUrl: z.url().max(2048).meta({ description: '登录回调 URL' }),
    isWecomWorkTerminal: z.boolean().optional().default(false).meta({
      description: '是否在企业微信工作台内发起登录'
    })
  })
  .strict();
export type CreateOauthLoginBodyType = z.infer<typeof CreateOauthLoginBodySchema>;

export const CreateOauthLoginResponseSchema = z
  .object({
    state: z.string().min(32).max(128).meta({ description: '服务端生成的一次性 OAuth state' }),
    url: z.url().meta({ description: 'Provider 授权地址' })
  })
  .strict();
export type CreateOauthLoginResponseType = z.infer<typeof CreateOauthLoginResponseSchema>;

const reservedOAuthCallbackProps = new Set(['method', 'username', 'state', 'code', 'callbackUrl']);

const OAuthStateSchema = z.string().min(32).max(128).meta({
  description: '服务端生成的一次性 OAuth state；仅旧 SSO 回调可以省略'
});

export const OAuthCallbackPropsSchema = z
  .record(
    z
      .string()
      .regex(/^[A-Za-z0-9_.-]+$/)
      .max(64),
    z.string().max(4096)
  )
  .superRefine((value, context) => {
    const keys = Object.keys(value);
    if (keys.length > 20) {
      context.addIssue({
        code: 'custom',
        message: 'OAuth callback props cannot contain more than 20 fields'
      });
    }
    for (const key of keys) {
      if (reservedOAuthCallbackProps.has(key)) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'OAuth callback props contain a reserved field'
        });
      }
    }
  });

const OauthLoginCommonBodySchema = TrackRegisterParamsSchema.extend({
  callbackUrl: z.url().max(2048).meta({ description: '登录回调 URL' }),
  code: z.string().min(1).max(4096).meta({ description: 'Provider 返回的授权 Code' }),
  props: OAuthCallbackPropsSchema.optional().meta({ description: 'SSO 回调附加属性' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});

/* ============================================================================
 * API: 消费 OAuth 登录回调
 * Route: POST /proApi/support/user/account/login/oauth
 * Method: POST
 * Description: 校验 OAuth state，或兼容旧 SSO 的无 state code-only 回调，并完成登录
 * Tags: ['Account Verification', 'User', 'Write']
 * ============================================================================ */
export const OauthLoginBodySchema = z.discriminatedUnion('provider', [
  OauthLoginCommonBodySchema.extend({
    provider: z.literal('sso').meta({ description: '旧 SSO 兼容 Provider' }),
    state: OAuthStateSchema.optional()
  }).strict(),
  OauthLoginCommonBodySchema.extend({
    provider: OAuthAccountVerificationProviderSchema.exclude(['sso']).meta({
      description: '必须校验 state 的 OAuth Provider'
    }),
    state: OAuthStateSchema
  }).strict()
]);
export type OauthLoginBodyType = z.infer<typeof OauthLoginBodySchema>;

// ===== Fast Login =====
export const FastLoginBodySchema = TrackRegisterParamsSchema.extend({
  token: z.string().meta({ description: 'Token' }),
  code: z.string().meta({ description: 'Code' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
}).strict();
export type FastLoginBodyType = z.infer<typeof FastLoginBodySchema>;

// ===== WeChat Login Result =====
export const WxLoginBodySchema = TrackRegisterParamsSchema.extend({
  code: z.string().min(16).max(128).meta({ description: '微信登录 Code' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
}).strict();
export type WxLoginBodyType = z.infer<typeof WxLoginBodySchema>;
export const GetWXLoginQRResponseSchema = z
  .object({
    code: z.string().min(16).max(128).meta({ description: '微信登录 Code' }),
    codeUrl: z.url().meta({ description: '微信登录二维码 URL' }),
    expiredAt: z.iso.datetime().optional().meta({ description: '二维码业务过期时间' })
  })
  .strict();
export type GetWXLoginQRResponseType = z.infer<typeof GetWXLoginQRResponseSchema>;
