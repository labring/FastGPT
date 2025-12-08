import { UserError } from '@fastgpt/global/common/error/utils';

export const validateFileUrlDomain = (url: string): boolean => {
  try {
    const whitelistArray = global.systemEnv?.fileUrlWhitelist || [];

    // Allow all URLs if the whitelist is empty
    if (whitelistArray.length === 0) {
      return true;
    }

    const urlObj = new URL(url);

    const isAllowed = whitelistArray.some((domain) => {
      if (!domain || typeof domain !== 'string') return false;
      return urlObj.hostname === domain;
    });

    if (!isAllowed) {
      throw new UserError(`URL domain not allowed: ${urlObj.hostname}`);
    }

    return true;
  } catch (error) {
    if (error instanceof UserError) {
      throw error;
    }
    console.error('Error validating file URL domain:', error);
    throw new UserError('Invalid URL format');
  }
};
