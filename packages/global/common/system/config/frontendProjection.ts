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
 * 保留旧注册方式数组中的自定义顺序与 phone/sync 配置，仅让新的邮箱注册开关接管 email 项。
 * 旧数组缺失时按历史默认的 email + phone 计算。
 */
export const buildRegisterMethods = ({
  legacyMethods,
  auth
}: {
  legacyMethods?: FastGPTRegisterMethodCompatType[];
  auth: SystemInstanceConfig['auth'];
}): FastGPTRegisterMethodCompatType[] =>
  (legacyMethods ?? ['email', 'phone']).filter(
    (method) => method !== 'email' || auth.loginProviders.email.register
  );
