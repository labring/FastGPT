import {
  createInternalAddressChecker,
  PRIVATE_URL_TEXT
} from '@fastgpt/global/common/system/network';
import { serviceEnv } from '../../env';

const { isInternalAddress } = createInternalAddressChecker({
  checkInternalIp: () => serviceEnv.CHECK_INTERNAL_IP
});

export { isInternalAddress, PRIVATE_URL_TEXT };

/**
 * 用于"保存配置 URL"或"调用前校验"的统一安全检查:
 *  - 必须是合法 URL
 *  - 协议必须是 http/https
 *  - 不能指向内部地址(loopback/metadata,以及在 CHECK_INTERNAL_IP=true 时的私网)
 *
 * 注意:`isInternalAddress` 在 dev 环境直接放行;为了让保存入口
 * 在 dev 也能拒绝明显错误的 URL(localhost / metadata),
 * 这里**不依赖 isDevEnv**,而是用同一套规则做轻量校验。
 */
export const checkUrlSafety = async (url: string, fieldName = 'URL'): Promise<void> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error(`${fieldName} must be a valid URL`));
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Promise.reject(new Error(`${fieldName} must use http or https protocol`));
  }

  if (await isInternalAddress(url)) {
    return Promise.reject(new Error(`${fieldName}: ${PRIVATE_URL_TEXT}`));
  }
};
