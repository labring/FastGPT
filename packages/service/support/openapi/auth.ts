import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { updateApiKeyUsedTime } from './tools';
import { MongoOpenApi } from './schema';
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';

export type AuthOpenApiLimitProps = { openApi: OpenApiSchema };

export type OpenApiKeyType = 'team' | 'app';

export async function authOpenApiKey({
  apikey,
  authApiKey = true,
  authAppApiKey = false
}: {
  apikey: string;
  authApiKey?: boolean;
  authAppApiKey?: boolean;
}) {
  if (!apikey) {
    return Promise.reject(ERROR_ENUM.unAuthApiKey);
  }
  try {
    const openApi = await MongoOpenApi.findOne({ apiKey: apikey.trim() }).lean();
    if (!openApi) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    const keyType: OpenApiKeyType = openApi.appId ? 'app' : 'team';
    const isAllowedKeyType =
      (keyType === 'team' && authApiKey) || (keyType === 'app' && authAppApiKey);

    // 调用点必须显式声明接受 team/app APIKey，拒绝时不能触发限额与使用时间更新。
    if (!isAllowedKeyType) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    // auth limit
    await global.authOpenApiHandler({
      openApi
    });

    updateApiKeyUsedTime(openApi._id);

    return {
      apikey,
      teamId: String(openApi.teamId),
      tmbId: String(openApi.tmbId),
      appId: openApi.appId || '',
      authProxy: !!openApi.authProxy,
      sourceName: openApi.name,
      keyType
    };
  } catch (error) {
    return Promise.reject(error);
  }
}
