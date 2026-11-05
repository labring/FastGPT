import type { FastGPTFeConfigsType, FastGPTRegisterMethodCompatType } from '../types';
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
          tenantId: providers.microsoft.tenantId,
          customButton: providers.microsoft.customButton
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

/**
 * 保留旧注册方式数组中的自定义顺序与 phone/sync 配置，仅让新的邮箱注册开关接管 email 项。
 * 旧数组缺失时按历史默认的 email + phone 计算。
 *
 * 邮箱开关必须既能移除也能重新加入 email：只做过滤时，旧数组为 [phone] 或 [] 的实例
 * 管理员重新开启邮箱注册后前端仍不会出现 email 入口，而 Pro 的注册校验已按新布尔值放行。
 */
export const buildRegisterMethods = ({
  legacyMethods,
  auth
}: {
  legacyMethods?: FastGPTRegisterMethodCompatType[];
  auth: SystemInstanceConfig['auth'];
}): FastGPTRegisterMethodCompatType[] => {
  const methods = [...(legacyMethods ?? ['email', 'phone'])];
  const emailIndex = methods.indexOf('email');
  const otherMethods: FastGPTRegisterMethodCompatType[] = methods.filter(
    (method) => method !== 'email'
  );

  if (!auth.loginProviders.email.register) {
    return otherMethods;
  }

  // 旧数组本来有 email 时放回原位置；没有时补到首位（历史默认顺序），
  // 不改变其它注册方式的相对顺序。
  otherMethods.splice(
    emailIndex === -1 ? 0 : Math.min(emailIndex, otherMethods.length),
    0,
    'email'
  );
  return otherMethods;
};
