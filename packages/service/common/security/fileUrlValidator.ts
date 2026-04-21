import { env } from '../../env';

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
  appendHost({ list, value: env.STORAGE_S3_ENDPOINT, allowRawHost: true });
  appendHost({ list, value: env.STORAGE_EXTERNAL_ENDPOINT });
  if (process.env.FE_DOMAIN) {
    try {
      const urlData = new URL(process.env.FE_DOMAIN);
      list.push(urlData.hostname);
    } catch (error) {}
  }
  if (process.env.PRO_URL) {
    try {
      const urlData = new URL(process.env.PRO_URL);
      list.push(urlData.hostname);
    } catch (error) {}
  }
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
