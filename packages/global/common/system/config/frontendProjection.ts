import type { FastGPTFeConfigsType, FastGPTRegisterMethodType } from '../types';
import type { SystemInstanceConfig } from './schema';

/** 公开配置仅暴露自定义域名开关及 CNAME，部署凭据始终留在服务端实例配置中。 */
export const buildCustomDomainFeConfig = (
  config: SystemInstanceConfig['site']['customDomain']
): FastGPTFeConfigsType['customDomain'] => ({
  enable: config?.enable,
  domain: config?.domain
});

/** 将实例配置中的登录凭据投影为前端 OAuth 入口；缺少完整凭据的 Provider 不展示。 */
export const buildOauthFeConfig = (
  auth: SystemInstanceConfig['auth']
): FastGPTFeConfigsType['oauth'] => {
  const providers = auth?.loginProviders;

  return {
    github: providers?.github?.clientId || undefined,
    google: providers?.google?.clientId || undefined,
    wechat:
      providers?.wechat?.appId && providers?.wechat?.appSecret
        ? providers?.wechat?.appId
        : undefined,
    microsoft: providers?.microsoft?.clientId
      ? {
          clientId: providers?.microsoft?.clientId,
          tenantId: providers?.microsoft?.tenantId
        }
      : undefined,
    wecom: Boolean(providers?.wecom?.suiteId && providers?.wecom?.secret)
  };
};

/**
 * 将实例配置中的支付凭据投影为前端可用渠道。
 *
 * 渠道可用性必须从同一份权威配置派生：旧库 feConfigs.payConfig 是历史快照，
 * 管理员新增或删除渠道后不会更新，前端会继续展示已删除的旧入口、隐藏新入口。
 * 判定规则与旧 Pro 保持一致：微信私钥、支付宝根证书、对公转账说明存在即视为已配置。
 */
export const buildPayConfig = (
  commercial: SystemInstanceConfig['commercial']
): NonNullable<FastGPTFeConfigsType['payConfig']> => ({
  wx: Boolean(commercial?.payment?.wx?.privateKey),
  alipay: Boolean(commercial?.payment?.alipay?.rootCertContent),
  bank: Boolean(commercial?.payment?.bank?.description)
});

/** 是否至少配置了一个可用支付渠道；用于 show_pay 公开入口。 */
export const hasPayChannel = (payConfig: ReturnType<typeof buildPayConfig>) =>
  Boolean(payConfig.wx || payConfig.alipay || payConfig.bank);

const hasSmsTemplate = (template?: string) =>
  typeof template === 'string' && Boolean(template.trim());
const hasPhoneSmsChannel = (auth: SystemInstanceConfig['auth']) => {
  const phone = auth?.loginProviders?.phone;
  return Boolean(phone?.accessKeyId && phone?.accessKeySecret && phone?.signName);
};
const hasEmailService = (auth: SystemInstanceConfig['auth']) => {
  const email = auth?.loginProviders?.email;
  return Boolean(email?.smtp && email?.user && email?.pass);
};

/**
 * 从当前认证配置推导可用的邮箱/手机号登录（含验证码登录与自动建号）渠道。
 * - 邮箱：需开启邮箱开关（email.register）；
 * - 手机号：需同时具备短信通道与登录模板（sms.login.zh）；未配置登录模板时不回退已弃用的注册模板。
 */
export const buildLoginMethods = ({
  auth
}: {
  auth: SystemInstanceConfig['auth'];
}): FastGPTRegisterMethodType[] => {
  const methods: FastGPTRegisterMethodType[] = [];

  if (auth?.loginProviders?.email?.register) {
    methods.push('email');
  }
  if (hasPhoneSmsChannel(auth) && hasSmsTemplate(auth?.loginProviders?.sms?.login?.zh)) {
    methods.push('phone');
  }

  return methods;
};

/**
 * 从当前认证配置推导前端认证能力字段。
 *
 * - login_method 统一表示开放的邮箱/手机号登录与验证码登录渠道（用户名密码登录始终可用）；
 * - 邮箱找回/绑定通知需要可发送邮件的 SMTP 配置；
 * - 手机找回/绑定通知需要短信通道及对应模板。
 */
export const buildAuthMethodProjection = ({
  auth
}: {
  auth: SystemInstanceConfig['auth'];
}): {
  login_method: FastGPTRegisterMethodType[];
  find_password_method: FastGPTRegisterMethodType[];
  bind_notification_method: FastGPTRegisterMethodType[];
} => {
  const providers = auth?.loginProviders;
  const sms = providers?.sms;
  const phoneReady = hasPhoneSmsChannel(auth);
  const emailReady = hasEmailService(auth);

  return {
    login_method: buildLoginMethods({ auth }),
    find_password_method: [
      ...(emailReady ? (['email'] as const) : []),
      ...(phoneReady && hasSmsTemplate(sms?.resetPassword?.zh) ? (['phone'] as const) : [])
    ],
    bind_notification_method: [
      ...(emailReady ? (['email'] as const) : []),
      ...(phoneReady && hasSmsTemplate(sms?.bindNotification?.zh) ? (['phone'] as const) : [])
    ]
  };
};
