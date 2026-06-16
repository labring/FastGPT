import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { updateApiKeyUsedTime } from './tools';
import { MongoOpenApi } from './schema';
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import type { ApiRequestProps } from '../../type/next';

export type AuthOpenApiLimitProps = { openApi: OpenApiSchema };

type ApiKeyRequest = Pick<ApiRequestProps, 'method' | 'url'>;

const AppApiKeyChatCompletionPaths = new Set([
  '/api/v1/chat/completions',
  '/v1/chat/completions',
  '/api/v2/chat/completions',
  '/v2/chat/completions'
]);

const getRequestPath = (url?: string) => {
  if (!url) return '';

  const path = new URL(url, 'http://fastgpt.local').pathname;
  return path.replace(/\/+$/, '') || '/';
};

/**
 * 判断当前请求是否为 app 级 APIKey 允许的应用对话调用入口。
 * app 级 APIKey 只绑定单个应用，不能复用团队级 APIKey 的其它开放 API 权限面。
 */
export const isAppApiKeyChatCompletionsRequest = (req?: ApiKeyRequest) => {
  if (req?.method?.toUpperCase() !== 'POST') return false;

  return AppApiKeyChatCompletionPaths.has(getRequestPath(req.url));
};

export async function authOpenApiKey({
  apikey,
  req,
  authorizationAppId
}: {
  apikey: string;
  req?: ApiKeyRequest;
  authorizationAppId?: string;
}) {
  if (!apikey) {
    return Promise.reject(ERROR_ENUM.unAuthApiKey);
  }
  try {
    const openApi = await MongoOpenApi.findOne({ apiKey: apikey.trim() }).lean();
    if (!openApi) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    if ((openApi.appId || authorizationAppId) && !isAppApiKeyChatCompletionsRequest(req)) {
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
      sourceName: openApi.name
    };
  } catch (error) {
    return Promise.reject(error);
  }
}
