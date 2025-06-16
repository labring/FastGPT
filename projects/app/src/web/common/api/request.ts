import axios, {
  Method,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosProgressEvent,
  AxiosRequestConfig
} from 'axios';
import { clearToken } from '@/web/support/user/auth';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useSystemStore } from '../system/useSystemStore';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

interface ConfigType {
  headers?: { [key: string]: string };
  timeout?: number;
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
  cancelToken?: AbortController;
  maxQuantity?: number; // The maximum number of simultaneous requests, usually used to cancel old requests
  withCredentials?: boolean;
}
interface ResponseDataType {
  code: number;
  message?: string;
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

/* 
  Every request generates a unique sign
  If the number of requests exceeds maxQuantity, cancel the earliest request and initiate a new request
*/
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

/**
 * 请求开始
 */
function startInterceptors(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  // Token is now primarily handled by HttpOnly cookie (fastgpt_token)
  // and withCredentials: true in axios requests.
  // The Authorization header from localStorage might not be needed for standard user sessions.
  // const token = localStorage.getItem('token');
  // if (token && config.headers) {
  //   config.headers['Authorization'] = `Bearer ${token}`;
  // }
  return config;
}

/**
 * 请求成功,检查请求头
 */
function responseSuccess(response: AxiosResponse<ResponseDataType>) {
  if (response?.data?.code !== 200) {
    return Promise.reject(response?.data);
  }
  return response?.data?.data;
}
/**
 * 响应数据检查
 */
function checkRes(data: ResponseDataType) {
  if (data === undefined) {
    console.log('error->', data, 'data is empty');
    return Promise.reject('服务器异常');
  } else if (data.code < 200 || data.code >= 400) {
    return Promise.reject(data);
  }
  return data.data;
}

/**
 * 响应错误
 */
function responseError(error: any) {
  console.log('error->', '请求错误', error);
  const data = error?.response?.data || error;

  if (!error) {
    return Promise.reject({ message: '未知错误' });
  }
  if (typeof error === 'string') {
    return Promise.reject({ message: error });
  }
  if (typeof data === 'string') {
    return Promise.reject(data);
  }

  // 有报错响应
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
    // data?.statusText === TeamErrEnum.websiteSyncNotEnough || // 已移除网站同步的商业版限制
    data?.statusText === TeamErrEnum.reRankNotEnough
  ) {
    useSystemStore.getState().setNotSufficientModalType(data.statusText);
    return Promise.reject(data);
  }
  return Promise.reject(data);
}

/* 创建请求实例 */
const instance = axios.create({
  timeout: 60000, // 超时时间
  headers: {
    'Content-Type': 'application/json'
  }
});

/* 请求拦截 */
instance.interceptors.request.use(startInterceptors, (error: Error) => Promise.reject(error));
/* 响应拦截 */
instance.interceptors.response.use(responseSuccess, (error: Error) => Promise.reject(error));

function request(
  url: string,
  data: any,
  { cancelToken, maxQuantity, withCredentials, ...config }: ConfigType,
  method: Method
): any {
  /* 去空 */
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
      ...config // 用户自定义配置，可以覆盖前面的配置
    })
    .then((res) => checkRes(res.data))
    .catch((err) => responseError(err))
    .finally(() => requestFinish({ signId, url }));
}

/**
 * api请求方式
 * @param {String} url
 * @param {Any} params
 * @param {Object} config
 * @returns
 */
export const GET = <T>(
  url: string,
  params?: Record<string, any>,
  config?: AxiosRequestConfig
): Promise<T> =>
  instance.get(url, {
    params,
    withCredentials: true,
    ...config
  });

export const POST = <T>(
  url: string,
  data?: Record<string, any>,
  config: AxiosRequestConfig = {}
): Promise<T> => {
  const finalConfig: AxiosRequestConfig = {
    withCredentials: true,
    ...config,
    headers: {
      ...(instance.defaults.headers.post as any),
      ...config.headers
    }
  };
  return instance.post(url, data, finalConfig);
};

export const PUT = <T>(
  url: string,
  data?: Record<string, any>,
  config?: AxiosRequestConfig
): Promise<T> =>
  instance.put(url, data, {
    withCredentials: true,
    ...config
  });

export const DELETE = <T>(
  url: string,
  data?: Record<string, any>,
  config?: AxiosRequestConfig
): Promise<T> =>
  instance.delete(url, {
    data,
    withCredentials: true,
    ...config
  });
