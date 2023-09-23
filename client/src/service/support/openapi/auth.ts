import { ERROR_ENUM } from '@/service/errorCode';
import { updateApiKeyUsedTime } from './index';
import { OpenApi } from './schema';

export async function authOpenApiKey({ apikey }: { apikey: string }) {
  if (!apikey) {
    return Promise.reject(ERROR_ENUM.unAuthApiKey);
  }

  try {
    const openApi = await OpenApi.findOne({ apiKey: apikey });
    if (!openApi) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }
    const userId = String(openApi.userId);

    // auth limit
    if (global.feConfigs?.isPlus) {
      if (openApi?.limit?.expiredTime && openApi.limit.expiredTime.getTime() < Date.now()) {
        return Promise.reject(`Key ${openApi.apiKey} is expired`);
      }

      if (
        openApi?.limit?.credit &&
        openApi.limit.credit > -1 &&
        openApi.usage > openApi.limit.credit
      ) {
        return Promise.reject(`Key ${openApi.apiKey} is over usage`);
      }
    }

    updateApiKeyUsedTime(openApi._id);

    return { apikey, userId, appId: openApi.appId };
  } catch (error) {
    return Promise.reject(error);
  }
}
