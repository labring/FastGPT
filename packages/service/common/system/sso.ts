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
  isWecom?: boolean;
};

/**
 * 获取 Pro 部署环境中的 SSO 接入状态及是否为企业微信 provider。
 * 优先读取同进程注入的 resolver，主服务通过内部接口显式携带 includeProvider=true 读取；
 * 未接入 Pro 的社区版返回 `{ enabled: false }`。
 * 兼容旧版 Pro 或探测失败时保留 `isWecom: undefined`（未知态），不强行判为非企业微信。
 * 服务不可用或响应非法时拒绝降级，且不传播可能包含服务间令牌的错误。
 */
export const getSsoConfig = async (): Promise<SsoRuntimeConfig> => {
  const normalizeConfig = (raw: unknown): SsoRuntimeConfig => {
    const parsed = ProSsoConfigResponseSchema.parse(raw);
    if (!parsed.enabled) {
      return { enabled: false };
    }
    return parsed.isWecom === undefined
      ? { enabled: true }
      : { enabled: true, isWecom: parsed.isWecom };
  };

  try {
    if (global.getSsoConfigHandler) {
      return normalizeConfig(await global.getSsoConfigHandler());
    }
    if (global.getSsoConfiguredHandler) {
      const enabled = await global.getSsoConfiguredHandler();
      return normalizeConfig({ enabled });
    }
    if (!FastGPTProUrl) {
      return { enabled: false };
    }

    const result = await GET(
      '/common/system/sso/config',
      { includeProvider: true },
      { timeout: 1500 }
    );
    return normalizeConfig(result);
  } catch {
    throw new SsoConfigurationUnavailableError();
  }
};

/**
 * 获取 Pro 部署环境中的 SSO 接入状态。Pro 进程使用本地注入的 resolver（同步读取快照），
 * 主服务通过内部接口不带 includeProvider 参数读取，确保密码安全校验路径不触发 Pro 侧的
 * 外部 SSO provider 网络探测；未接入 Pro 的社区版返回 false。
 * 服务不可用或响应非法时拒绝降级，由调用方分别决定展示降级与密码安全策略。
 */
export const getSsoConfigured = async (): Promise<boolean> => {
  try {
    if (global.getSsoConfiguredHandler) {
      const enabled = await global.getSsoConfiguredHandler();
      return ProSsoConfigResponseSchema.parse({ enabled }).enabled;
    }
    if (!FastGPTProUrl) {
      return false;
    }

    const result = await GET('/common/system/sso/config', {}, { timeout: 1500 });
    return ProSsoConfigResponseSchema.parse(result).enabled;
  } catch {
    throw new SsoConfigurationUnavailableError();
  }
};
