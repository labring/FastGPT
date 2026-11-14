import type {
  FastGPTFeConfigsType,
  FastGPTRegisterMethodCompatType,
  FastGPTRegisterMethodType
} from '../types';
import type { SystemInstanceConfig } from './schema';

/** 将实例配置中的登录凭据投影为前端 OAuth 入口；缺少完整凭据的 Provider 不展示。 */
export const buildOauthFeConfig = (
  auth: SystemInstanceConfig['auth']
): FastGPTFeConfigsType['oauth'] => {
  const providers = auth.loginProviders;

  return {
    github: providers.github.clientId || undefined,
    google: providers.google.clientId || undefined,
    wechat:
      providers.wechat.appId && providers.wechat.appSecret ? providers.wechat.appId : undefined,
    microsoft: providers.microsoft.clientId
      ? {
          clientId: providers.microsoft.clientId,
          tenantId: providers.microsoft.tenantId
        }
      : undefined,
    wecom: Boolean(providers.wecom.suiteId && providers.wecom.secret)
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
  wx: Boolean(commercial.payment.wx.privateKey),
  alipay: Boolean(commercial.payment.alipay.rootCertContent),
  bank: Boolean(commercial.payment.bank.description)
});

/** 是否至少配置了一个可用支付渠道；用于 show_pay 公开入口。 */
export const hasPayChannel = (payConfig: ReturnType<typeof buildPayConfig>) =>
  Boolean(payConfig.wx || payConfig.alipay || payConfig.bank);

const hasSmsTemplate = (template?: string) => Boolean(template?.trim());
const hasPhoneSmsChannel = (auth: SystemInstanceConfig['auth']) => {
  const phone = auth.loginProviders.phone;
  return Boolean(phone.accessKeyId && phone.accessKeySecret && phone.signName);
};
const hasEmailService = (auth: SystemInstanceConfig['auth']) => {
  const email = auth.loginProviders.email;
  return Boolean(email.smtp && email.user && email.pass);
};

/**
 * 从当前认证配置推导注册方式。
 * 邮箱注册由显式开关决定；手机号注册必须同时具备短信模板和发送通道，
 * 不再沿用旧 register_method 中的手机号或默认手机号。
 */
export const buildRegisterMethods = ({
  legacyMethods,
  auth
}: {
  legacyMethods?: FastGPTRegisterMethodCompatType[];
  auth: SystemInstanceConfig['auth'];
}): FastGPTRegisterMethodCompatType[] => {
  const methods: FastGPTRegisterMethodCompatType[] = [];

  if (auth.loginProviders.email.register) {
    methods.push('email');
  }
  if (hasPhoneSmsChannel(auth) && hasSmsTemplate(auth.loginProviders.sms.register.zh)) {
    methods.push('phone');
  }
  // sync 是团队模式的历史兼容项，团队模式仍以 teamMode 为权威。
  if (legacyMethods?.includes('sync') || auth.teamMode === 'sync') {
    methods.push('sync');
  }
  return methods;
};

/**
 * 从当前认证配置推导四个兼容前端字段。
 *
 * - 邮箱密码登录不依赖 SMTP，login_method 始终保留 email；
 * - 手机号登录/注册/找回/绑定入口必须同时具备短信通道和对应模板；
 * - 邮箱找回/绑定通知需要可发送邮件的 SMTP 配置；
 * - legacyRegisterMethods 只用于保留 sync 历史兼容，不再提供 phone 默认值。
 */
export const buildAuthMethodProjection = ({
  auth,
  legacyRegisterMethods
}: {
  auth: SystemInstanceConfig['auth'];
  legacyRegisterMethods?: FastGPTRegisterMethodCompatType[];
}): {
  login_method: FastGPTRegisterMethodType[];
  register_method: FastGPTRegisterMethodCompatType[];
  find_password_method: FastGPTRegisterMethodType[];
  bind_notification_method: FastGPTRegisterMethodType[];
} => {
  const providers = auth.loginProviders;
  const sms = providers.sms;
  const phoneReady = hasPhoneSmsChannel(auth);
  const emailReady = hasEmailService(auth);

  return {
    login_method: [
      'email',
      ...(phoneReady && hasSmsTemplate(sms.login.zh) ? (['phone'] as const) : [])
    ],
    register_method: buildRegisterMethods({
      legacyMethods: legacyRegisterMethods,
      auth
    }),
    find_password_method: [
      ...(emailReady ? (['email'] as const) : []),
      ...(phoneReady && hasSmsTemplate(sms.resetPassword.zh) ? (['phone'] as const) : [])
    ],
    bind_notification_method: [
      ...(emailReady ? (['email'] as const) : []),
      ...(phoneReady && hasSmsTemplate(sms.bindNotification.zh) ? (['phone'] as const) : [])
    ]
  };
};
