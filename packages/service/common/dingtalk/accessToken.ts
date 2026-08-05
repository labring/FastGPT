import { DingtalkAccessTokenCache } from '@fastgpt/dal/redis/caches';
import { axios } from '../api/axios';
import { getLogger, LogCategories } from '../logger';
import { serviceEnv } from '../../env';

type DingtalkAppCredentials = {
  appKey: string;
  appSecret?: string;
};
type DingtalkAccessTokenResponse = {
  accessToken: string;
  expireIn: number;
};

const logger = getLogger(LogCategories.MODULE.OUTLINK.DINGTALK);
const dingtalkAccessTokenCache = new DingtalkAccessTokenCache({ logger });
const isRateLimitError = (error: any) => {
  const status = error?.response?.status;
  const data = error?.response?.data || error?.data || {};
  const code = String(data.code ?? data.errcode ?? data.errorCode ?? '');
  const message = String(data.message ?? data.errmsg ?? error?.message ?? '');

  return (
    status === 429 ||
    code === '429' ||
    code === '88' ||
    code === '90018' ||
    /rate|limit|too many|频繁|限流/i.test(message)
  );
};

/**
 * Gets a cached DingTalk app access token. Concurrent callers for the same app share one refresh
 * request, and the cache expires five minutes before DingTalk's reported expiration.
 */
export const getDingtalkAppAccessToken = async ({
  appKey,
  appSecret
}: DingtalkAppCredentials): Promise<string> => {
  if (!appKey || !appSecret) {
    return Promise.reject('钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限');
  }

  try {
    return await dingtalkAccessTokenCache.getOrRefresh({
      server: { appKey, appSecret },
      fetchToken: async () => {
        const { data } = await axios.post<DingtalkAccessTokenResponse>(
          `${serviceEnv.DINGTALK_BASE_URL}/v1.0/oauth2/accessToken`,
          { appKey, appSecret }
        );
        if (!data?.accessToken) {
          return Promise.reject('钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限');
        }
        return data;
      }
    });
  } catch (error) {
    logger.warn('DingTalk accessToken request failed', { appKey, error });
    if (isRateLimitError(error)) {
      return Promise.reject('钉钉鉴权接口请求过快，请稍后重试');
    }
    return Promise.reject('钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限');
  }
};
