import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { updateApiKeyUsedTime } from './tools';
import { MongoOpenApi } from './schema';
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';

export type AuthOpenApiLimitProps = { openApi: OpenApiSchema };

const ApiKeyAppIdCredentialReg = /^(.+)-([a-fA-F0-9]{24})$/;

/**
 * 解析开放接口 Authorization 中的 APIKey 凭证。
 *
 * `apiKey-appId` 仅用于 OpenAI SDK 兼容，后缀必须是 24 位 ObjectId；
 * 命中时只用真实 APIKey 查库，`parsedAppId` 作为 completions 的 appId 兜底来源。
 */
export function resolveOpenApiCredential(rawCredential: string) {
  const credential = rawCredential.trim();
  const match = credential.match(ApiKeyAppIdCredentialReg);

  if (!match) {
    return {
      apikey: credential,
      parsedAppId: ''
    };
  }

  return {
    apikey: match[1],
    parsedAppId: match[2]
  };
}

export async function authOpenApiKey({
  apikey,
  authApiKey = true
}: {
  apikey: string;
  authApiKey?: boolean;
}) {
  if (!apikey) {
    return Promise.reject(ERROR_ENUM.unAuthApiKey);
  }
  try {
    if (!authApiKey) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    const { apikey: realApiKey, parsedAppId } = resolveOpenApiCredential(apikey);
    const openApi = await MongoOpenApi.findOne({ apiKey: realApiKey }).lean();
    if (!openApi) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    // auth limit
    await global.authOpenApiHandler({
      openApi
    });

    updateApiKeyUsedTime(openApi._id);

    return {
      apikey: realApiKey,
      teamId: String(openApi.teamId),
      tmbId: String(openApi.tmbId),
      legacyAppId: openApi.appId || '',
      parsedAppId,
      authProxy: !!openApi.authProxy,
      sourceName: openApi.name
    };
  } catch (error) {
    return Promise.reject(error);
  }
}
