import z from 'zod';
import { positiveInteger, textWithDefault, urlWithDefault } from './primitives';

/** 账号验证类短信模板（登录、注册、找回、绑定、注销）。 */
const SmsTemplateConfigSchema = z.strictObject({
  zh: z.string().max(2000).default('')
});

const LoginSmsConfigSchema = z.strictObject({
  login: SmsTemplateConfigSchema.prefault({}),
  register: SmsTemplateConfigSchema.prefault({}),
  resetPassword: SmsTemplateConfigSchema.prefault({}),
  changePassword: SmsTemplateConfigSchema.prefault({}),
  bindNotification: SmsTemplateConfigSchema.prefault({})
});

const EmailLoginConfigSchema = z.strictObject({
  smtp: textWithDefault(),
  user: textWithDefault(),
  pass: textWithDefault(),
  port: z.number().int().min(1).max(65535).default(465),
  secure: z.boolean().default(true),
  register: z.boolean().default(false)
});

/** 阿里云短信通道凭据。 */
const PhoneSmsChannelConfigSchema = z.strictObject({
  accessKeyId: textWithDefault(),
  accessKeySecret: textWithDefault(),
  signName: textWithDefault()
});

const OAuthConfigSchema = z.strictObject({
  clientId: textWithDefault(),
  secret: textWithDefault()
});

const MicrosoftOAuthConfigSchema = z.strictObject({
  clientId: textWithDefault(),
  secret: textWithDefault(),
  tenantId: textWithDefault(),
  customButton: textWithDefault()
});

const WechatLoginConfigSchema = z.strictObject({
  appId: textWithDefault(),
  appSecret: textWithDefault()
});

/** 企业微信第三方应用（服务商）接入配置。 */
const WecomLoginConfigSchema = z.strictObject({
  suiteId: textWithDefault(),
  secret: textWithDefault(),
  token: textWithDefault(),
  encodingAESKey: textWithDefault(),
  corpId: textWithDefault(),
  providerSecret: textWithDefault(),
  buyerUserId: textWithDefault(),
  basicVersionId: textWithDefault(),
  advancedVersionId: textWithDefault(),
  paySecret: textWithDefault()
});

const AccountCancellationConfigSchema = z.strictObject({
  cancellationSm: SmsTemplateConfigSchema.prefault({}),
  reminderSm: SmsTemplateConfigSchema.prefault({}),
  todaySm: SmsTemplateConfigSchema.prefault({}),
  enabled: z.boolean().default(false)
});

export const AuthConfigSchema = z.strictObject({
  openApiKeyMaxCount: positiveInteger(100),
  passwordExpiredMonth: z.number().int().positive().nullable().default(null),
  wecomLoginAutoRedirect: z.boolean().default(false),
  defaultTeamBasicPermissionsEnabled: z.boolean().default(false),
  // 团队模式：multi 多团队 / single 单团队 / sync 账号同步
  teamMode: z.enum(['multi', 'single', 'sync']).default('single'),
  loginProviders: z
    .strictObject({
      email: EmailLoginConfigSchema.prefault({}),
      sms: LoginSmsConfigSchema.prefault({}),
      phone: PhoneSmsChannelConfigSchema.prefault({}),
      wechat: WechatLoginConfigSchema.prefault({}),
      wecom: WecomLoginConfigSchema.prefault({}),
      github: OAuthConfigSchema.prefault({}),
      google: OAuthConfigSchema.prefault({}),
      microsoft: MicrosoftOAuthConfigSchema.prefault({}),
      dingtalk: OAuthConfigSchema.prefault({})
    })
    .prefault({}),
  // 免登入口列表：key 为自定义标识，authUrl 为跳转地址
  fastLogin: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(100),
        authUrl: urlWithDefault()
      })
    )
    .max(50)
    .default([]),
  accountCancellation: AccountCancellationConfigSchema.prefault({})
});
