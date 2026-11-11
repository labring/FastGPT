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

/**
 * 获取 Pro 部署环境中的 SSO 接入状态。Pro 进程使用本地注入的 resolver，主服务通过
 * 内部接口读取；未接入 Pro 的社区版返回 false。服务不可用或响应非法时拒绝降级，
 * 由调用方分别决定展示降级与密码安全策略，且不传播可能包含服务间令牌的错误。
 */
export const getSsoConfigured = async (): Promise<boolean> => {
  try {
    if (global.getSsoConfiguredHandler) {
      const enabled = await global.getSsoConfiguredHandler();
      return ProSsoConfigResponseSchema.parse({ enabled }).enabled;
    }
    if (!FastGPTProUrl) return false;

    const result = await GET('/common/system/sso/config', {}, { timeout: 1500 });
    return ProSsoConfigResponseSchema.parse(result).enabled;
  } catch {
    throw new SsoConfigurationUnavailableError();
  }
};
