import { serviceEnv } from '../../env';
import { getStorageExternalEndpoint, getStorageS3CdnEndpoint } from '../s3/config/constants';
import { logInstanceConfigRead } from '../system/migrationCoverageLog';

const appendHost = ({
  list,
  value,
  allowRawHost = false
}: {
  list: string[];
  value?: string;
  allowRawHost?: boolean;
}) => {
  if (!value) return;

  try {
    list.push(new URL(value).hostname);
  } catch {
    if (allowRawHost && !value.includes('://')) {
      list.push(value);
    }
  }
};

/**
 * 系统级可信域名白名单。
 * 存储公开地址可能来自实例配置（运行时可变），因此每次调用重新计算，
 * 避免模块加载期常量冻结导致配置变更后校验失效。
 */
const getSystemWhiteList = () => {
  const list: string[] = [];
  appendHost({ list, value: serviceEnv.STORAGE_S3_ENDPOINT, allowRawHost: true });
  appendHost({ list, value: getStorageExternalEndpoint() });
  appendHost({ list, value: serviceEnv.STORAGE_R2_PUBLIC_ENDPOINT });
  appendHost({ list, value: getStorageS3CdnEndpoint() });
  appendHost({ list, value: serviceEnv.FE_DOMAIN });
  appendHost({ list, value: serviceEnv.PRO_URL });
  return list;
};

export const validateFileUrlDomain = (url: string): boolean => {
  try {
    logInstanceConfigRead({
      callsite: 'runtime.common.security.fileUrlValidator',
      source: 'bridged-system-env',
      fields: [
        {
          path: 'security.checkExternalFile',
          value: global.systemEnv?.checkExternalFile
        },
        {
          path: 'security.fileUrlWhitelist',
          value: global.systemEnv?.fileUrlWhitelist
        }
      ]
    });

    // 关闭时保留已保存名单但不执行域名限制；开启后空名单仍表示不限域名。
    if (
      !global.systemEnv?.checkExternalFile ||
      (global.systemEnv.fileUrlWhitelist || []).length === 0
    ) {
      return true;
    }

    const whitelistArray = [...(global.systemEnv?.fileUrlWhitelist || []), ...getSystemWhiteList()];

    const urlObj = new URL(url);

    const isAllowed = whitelistArray.some((domain) => {
      if (!domain || typeof domain !== 'string') return false;
      return urlObj.hostname === domain;
    });

    if (!isAllowed) {
      return false;
    }

    return true;
  } catch {
    return true;
  }
};
