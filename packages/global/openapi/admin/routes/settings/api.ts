import z from 'zod';

const AuthProviderSchema = z
  .object({
    enabled: z.boolean().optional(),
    clientId: z.string(),
    secret: z.string()
  })
  .passthrough();

const UpdateAuthConfigSchema = z
  .object({
    googleServiceVerKey: z.string().optional(),
    email: z
      .object({
        enabled: z.boolean().optional(),
        register: z.boolean(),
        notification: z.boolean().optional(),
        smtp: z.string(),
        user: z.string(),
        pass: z.string(),
        port: z.number().int().positive().max(65535).optional(),
        secure: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    phone: z
      .object({
        enabled: z.boolean().optional(),
        register: z.boolean().optional(),
        notification: z.boolean().optional(),
        SNED_PHONE_ACCESSKEYID: z.string(),
        SNED_PHONE_ACCESSSECRET: z.string(),
        SNED_PHONE_SIGNNAME: z.string()
      })
      .passthrough()
      .optional(),
    sms: z.record(z.string(), z.string()).optional(),
    thirdPartyLogin: z
      .object({
        enabled: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    wechat: z
      .object({
        enabled: z.boolean().optional(),
        appID: z.string(),
        appSecret: z.string()
      })
      .passthrough()
      .optional(),
    github: AuthProviderSchema.optional(),
    google: AuthProviderSchema.optional(),
    microsoft: AuthProviderSchema.extend({
      tenantId: z.string(),
      customButton: z.string().optional()
    }).optional(),
    dingtalk: z
      .object({
        clientId: z.string(),
        secret: z.string()
      })
      .passthrough()
      .optional(),
    wecom: z
      .object({
        suiteId: z.string(),
        secret: z.string(),
        token: z.string(),
        encodingAESKey: z.string(),
        cropId: z.string(),
        providerSecret: z.string(),
        buyerUserId: z.string(),
        basicVersionId: z.string(),
        advancedVersionId: z.string(),
        paySecret: z.string()
      })
      .passthrough()
      .optional()
  })
  .passthrough()
  .optional();

const UpdateFastGPTConfigSchema = z
  .object({
    feConfigs: z
      .object({
        sso: z
          .object({
            icon: z.string().optional(),
            title: z.string().optional(),
            url: z.string().optional(),
            autoLogin: z.boolean().optional(),
            disablePasswordForSsoUsers: z.boolean().optional()
          })
          .passthrough()
          .optional()
      })
      .passthrough(),
    systemEnv: z.object({}).passthrough()
  })
  .passthrough();

const UpdateFastGPTProConfigSchema = z
  .object({
    auth: UpdateAuthConfigSchema,
    teamMode: z.enum(['multi', 'single', 'sync']).optional(),
    accountCancellation: z
      .object({
        enabled: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    censor: z.object({}).passthrough().optional(),
    pay: z.object({}).passthrough().optional(),
    fileUrlWhitelist: z.array(z.string()).optional(),
    license: z.never().optional()
  })
  .passthrough();

export const GetConfigResponseSchema = z.object({
  fastgpt: z.any().optional().meta({ description: '系统 FastGPT 配置' }),
  fastgptPro: z
    .any()
    .optional()
    .meta({ description: '系统 FastGPT Pro 商业版配置（不含 license）' })
});

export const UpdateConfigBodySchema = z
  .object({
    fastgpt: UpdateFastGPTConfigSchema.meta({ description: 'FastGPT 系统配置对象' }),
    fastgptPro: UpdateFastGPTProConfigSchema.meta({
      description: 'FastGPT Pro 商业版配置对象（不允许提交 license）'
    })
  })
  .strict();

export const UpdateConfigResponseSchema = z.undefined().meta({ description: '更新成功' });
