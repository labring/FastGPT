const systemWhiteList = (() => {
  const list: string[] = [];
  if (process.env.S3_ENDPOINT) {
    list.push(process.env.S3_ENDPOINT);
  }
  if (process.env.S3_EXTERNAL_BASE_URL) {
    try {
      const urlData = new URL(process.env.S3_EXTERNAL_BASE_URL);
      list.push(urlData.hostname);
    } catch (error) {}
  }
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
