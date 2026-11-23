import { ProSsoConfigResponseSchema } from '@fastgpt/global/openapi/common/system/api';
import { FastGPTProUrl } from './constants';
import { GET } from '../../thirdProvider/fastgptPro/plusRequest';

/** 能力来源不可用时的脱敏错误，展示场景可保守降级，安全操作仍应拒绝。 */
export class SsoConfigurationUnavailableError extends Error {
  constructor() {
    super('SSO configuration is unavailable');
    this.name = 'SsoConfigurationUnavailableError';
  }
}

export type SsoRuntimeConfig = {
  enabled: boolean;
  isWecom: boolean;
};

/**
 * 获取 Pro 部署环境中的 SSO 接入状态及是否为企业微信 provider。
 * 优先读取同进程注入的 resolver，主服务通过内部接口读取；未接入 Pro 的社区版返回
 * `{ enabled: false, isWecom: false }`。兼容旧版 Pro（未返回 isWecom）时默认 isWecom=false。
 * 服务不可用或响应非法时拒绝降级，且不传播可能包含服务间令牌的错误。
 */
export const getSsoConfig = async (): Promise<SsoRuntimeConfig> => {
  try {
    if (global.getSsoConfigHandler) {
      const parsed = ProSsoConfigResponseSchema.parse(await global.getSsoConfigHandler());
      return {
        enabled: parsed.enabled,
        isWecom: parsed.enabled && parsed.isWecom === true
      };
    }
    if (global.getSsoConfiguredHandler) {
      const enabled = await global.getSsoConfiguredHandler();
      const parsed = ProSsoConfigResponseSchema.parse({ enabled });
      return {
        enabled: parsed.enabled,
        isWecom: false
      };
    }
    if (!FastGPTProUrl) {
      return { enabled: false, isWecom: false };
    }

    const result = await GET('/common/system/sso/config', {}, { timeout: 1500 });
    const parsed = ProSsoConfigResponseSchema.parse(result);
    return {
      enabled: parsed.enabled,
      isWecom: parsed.enabled && parsed.isWecom === true
    };
  } catch {
    throw new SsoConfigurationUnavailableError();
  }
};

/**
 * 获取 Pro 部署环境中的 SSO 接入状态。Pro 进程使用本地注入的 resolver（同步读取快照，
 * 不触发外部 SSO 探测），主服务通过内部接口读取；未接入 Pro 的社区版返回 false。
 * 服务不可用或响应非法时拒绝降级，由调用方分别决定展示降级与密码安全策略。
 */
export const getSsoConfigured = async (): Promise<boolean> => {
  if (global.getSsoConfiguredHandler) {
    try {
      const enabled = await global.getSsoConfiguredHandler();
      return ProSsoConfigResponseSchema.parse({ enabled }).enabled;
    } catch {
      throw new SsoConfigurationUnavailableError();
    }
  }
  return (await getSsoConfig()).enabled;
};
