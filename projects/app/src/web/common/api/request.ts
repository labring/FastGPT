import type { Method, InternalAxiosRequestConfig, AxiosResponse, AxiosProgressEvent } from 'axios';
import axios, { AxiosRequestConfig } from 'axios';
import { clearToken } from '@/web/support/user/auth';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useSystemStore } from '../system/useSystemStore';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';

interface ConfigType {
  headers?: { [key: string]: string };
  timeout?: number;
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
  cancelToken?: AbortController;
  maxQuantity?: number;
  withCredentials?: boolean;
}
interface ResponseDataType {
  code: number;
  message: string;
  data: any;
}

const maxQuantityMap: Record<
  string,
  | undefined
  | {
      id: string;
      sign: AbortController;
    }[]
> = {};

function checkMaxQuantity({ url, maxQuantity }: { url: string; maxQuantity?: number }) {
  if (!maxQuantity) return {};
  const item = maxQuantityMap[url];
  const id = getNanoid();
  const sign = new AbortController();

  if (item && item.length > 0) {
    if (item.length >= maxQuantity) {
      const firstSign = item.shift();
      firstSign?.sign.abort();
    }
    item.push({ id, sign });
  } else {
    maxQuantityMap[url] = [{ id, sign }];
  }
  return {
    id,
    abortSignal: sign?.signal
  };
}

function requestFinish({ signId, url }: { signId?: string; url: string }) {
  const item = maxQuantityMap[url];
  if (item) {
    if (signId) {
      const index = item.findIndex((item) => item.id === signId);
      if (index !== -1) {
        item.splice(index, 1);
      }
    }
    if (item.length <= 0) {
      delete maxQuantityMap[url];
    }
  }
}

function startInterceptors(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (config.headers) {
  }

  return config;
}

function responseSuccess(response: AxiosResponse<ResponseDataType>) {
  return response;
}

function checkRes(data: ResponseDataType) {
  if (data === undefined) {
    return Promise.reject('服务器异常');
  } else if (data.code < 200 || data.code >= 400) {
    return Promise.reject(data);
  }
  return data.data;
}

function responseError(err: any) {
  const data = err?.response?.data || err;

  if (!err) {
    return Promise.reject({ message: '未知错误' });
  }
  if (typeof err === 'string') {
    return Promise.reject({ message: err });
  }
  if (typeof data === 'string') {
    return Promise.reject(data);
  }

  if (data?.code in TOKEN_ERROR_CODE) {
    if (!['/chat/share', '/chat/team', '/login'].includes(window.location.pathname)) {
      clearToken();
      window.location.replace(
        getWebReqUrl(`/login?lastRoute=${encodeURIComponent(location.pathname + location.search)}`)
      );
    }

    return Promise.reject({ message: i18nT('common:unauth_token') });
  }
  if (
    data?.statusText === TeamErrEnum.aiPointsNotEnough ||
    data?.statusText === TeamErrEnum.datasetSizeNotEnough ||
    data?.statusText === TeamErrEnum.datasetAmountNotEnough ||
    data?.statusText === TeamErrEnum.appAmountNotEnough ||
    data?.statusText === TeamErrEnum.pluginAmountNotEnough ||
    data?.statusText === TeamErrEnum.websiteSyncNotEnough ||
    data?.statusText === TeamErrEnum.reRankNotEnough
  ) {
    useSystemStore.getState().setNotSufficientModalType(data.statusText);
    return Promise.reject(data);
  }
  return Promise.reject(data);
}

const instance = axios.create({
  timeout: 60000,
  headers: {
    'content-type': 'application/json'
  }
});

instance.interceptors.request.use(startInterceptors, (err) => Promise.reject(err));
instance.interceptors.response.use(responseSuccess, (err) => Promise.reject(err));

function request(
  url: string,
  data: any,
  { cancelToken, maxQuantity, withCredentials, ...config }: ConfigType,
  method: Method
): any {
  for (const key in data) {
    if (data[key] === undefined) {
      delete data[key];
    }
  }

  const { id: signId, abortSignal } = checkMaxQuantity({ url, maxQuantity });

  return instance
    .request({
      baseURL: getWebReqUrl('/api'),
      url,
      method,
      data: ['POST', 'PUT'].includes(method) ? data : undefined,
      params: !['POST', 'PUT'].includes(method) ? data : undefined,
      signal: cancelToken?.signal ?? abortSignal,
      withCredentials,
      ...config
    })
    .then((res) => checkRes(res.data))
    .catch((err) => responseError(err))
    .finally(() => requestFinish({ signId, url }));
}

export function GET<T = undefined>(url: string, params = {}, config: ConfigType = {}): Promise<T> {
  return request(url, params, config, 'GET');
}

export const POST = async <T = any>(url: string, data?: any, options?: ConfigType): Promise<T> => {
  try {
    const config = options || {};
    const res = await request(url, data, config, 'POST');
    return res;
  } catch (error) {
    throw error;
  }
};

export function PUT<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'PUT');
}

export function DELETE<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'DELETE');
}
