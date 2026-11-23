import { ProSsoConfigResponseSchema } from '@fastgpt/global/openapi/common/system/api';
import { FastGPTProUrl } from './constants';
import { GET } from '../../thirdProvider/fastgptPro/plusRequest';

/** 读取部署侧 SSO provider；旧版 Pro、探测失败或未配置时保留未知态，不改变现有 SSO 启用状态。 */
export const getSsoIsWecom = async (): Promise<boolean | undefined> => {
  if (!global.systemEnv?.sso?.url || !FastGPTProUrl) return undefined;
  try {
    const result = ProSsoConfigResponseSchema.parse(
      await GET('/common/system/sso/config', { includeProvider: true }, { timeout: 1500 })
    );
    return result.enabled ? result.isWecom : undefined;
  } catch {
    // 滚动升级时旧版 Pro 尚无此接口，沿用维护版既有自动登录行为。
    return undefined;
  }
};
