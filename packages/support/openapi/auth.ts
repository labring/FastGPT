import { ERROR_ENUM } from '@fastgpt/common/constant/errorCode';
import { updateApiKeyUsedTime } from './tools';
import { MongoOpenApi } from './schema';
import { POST } from '@fastgpt/common/plusApi/request';
import { OpenApiSchema } from './type.d';

export type AuthOpenApiLimitProps = { openApi: OpenApiSchema };

export async function authOpenApiKey({ apikey }: { apikey: string }) {
  if (!apikey) {
    return Promise.reject(ERROR_ENUM.unAuthApiKey);
  }

  try {
    const openApi = await MongoOpenApi.findOne({ apiKey: apikey });
    if (!openApi) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }
    const userId = String(openApi.userId);

    // auth limit
    if (global.feConfigs?.isPlus) {
      await POST('/support/openapi/authLimit', { openApi } as AuthOpenApiLimitProps);
    }

    updateApiKeyUsedTime(openApi._id);

    return { apikey, userId, appId: openApi.appId };
  } catch (error) {
    return Promise.reject(error);
  }
}
