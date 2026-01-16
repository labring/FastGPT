import { PLUGIN_TOKEN } from '../../../thirdProvider/fastgptPlugin/index';
import type { ApiRequestProps } from '../../../type/next';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

/**
 * Auth plugin token from request header
 * Check if the 'authtoken' header matches the PLUGIN_TOKEN environment variable
 */
export const authPluginToken = async ({ req }: { req: ApiRequestProps }) => {
  const authtoken = req.headers.authtoken as string | undefined;

  if (!authtoken) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  if (!PLUGIN_TOKEN) {
    return Promise.reject('PLUGIN_TOKEN is not configured');
  }

  if (authtoken !== PLUGIN_TOKEN) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  return true;
};
