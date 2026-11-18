import { getSystemInstanceConfig } from '../system/systemInstanceConfig/runtime';
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
  appendHost({ list, value: getSystemInstanceConfig().site.publicUrl });
  appendHost({ list, value: serviceEnv.PRO_URL });
  return list;
};

/** 校验外链域名准入；仅明确关闭或合法空名单时不限域名，异常配置及校验失败一律拒绝。 */
export const validateFileUrlDomain = (url: string): boolean => {
  try {
    const { checkExternalFile, fileUrlWhitelist } = getSystemInstanceConfig().security;
    logInstanceConfigRead({
      callsite: 'runtime.common.security.fileUrlValidator',
      source: 'instance-config',
      fields: [
        {
          path: 'security.checkExternalFile',
          value: checkExternalFile
        },
        {
          path: 'security.fileUrlWhitelist',
          value: fileUrlWhitelist
        }
      ]
    });

    // 宽容读取可能保留错误类型；不能把损坏的开关或名单解释为关闭限制。
    if (checkExternalFile === false) return true;
    if (checkExternalFile !== true || !Array.isArray(fileUrlWhitelist)) return false;

    // 合法空名单沿用不限域名语义，不能用对象伪造的 length: 0 触发此分支。
    if (fileUrlWhitelist.length === 0) {
      return true;
    }

    const whitelistArray = [...fileUrlWhitelist, ...getSystemWhiteList()];

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
    return false;
  }
};
