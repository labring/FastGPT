import { serviceEnv } from '../../env';

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

const systemWhiteList = (() => {
  const list: string[] = [];
  appendHost({ list, value: serviceEnv.STORAGE_S3_ENDPOINT, allowRawHost: true });
  appendHost({ list, value: serviceEnv.STORAGE_EXTERNAL_ENDPOINT });
  appendHost({ list, value: serviceEnv.STORAGE_S3_CDN_ENDPOINT });
  appendHost({ list, value: serviceEnv.FE_DOMAIN });
  appendHost({ list, value: serviceEnv.PRO_URL });
  return list;
})();

export const validateFileUrlDomain = (url: string): boolean => {
  try {
    // Allow all URLs if the whitelist is empty
    if ((global.systemEnv?.fileUrlWhitelist || []).length === 0) {
      return true;
    }

    const whitelistArray = [...(global.systemEnv?.fileUrlWhitelist || []), ...systemWhiteList];

    const urlObj = new URL(url);

    const isAllowed = whitelistArray.some((domain) => {
      if (!domain || typeof domain !== 'string') return false;
      return urlObj.hostname === domain;
    });

    if (!isAllowed) {
      return false;
    }

    return true;
  } catch (error) {
    return true;
  }
};
