import axios, {
  type Method,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosProgressEvent
} from 'axios';
import { clearToken } from '@/web/support/user/auth';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useSystemStore } from '../system/useSystemStore';
import { getWebReqUrl, subRoute } from '@fastgpt/web/common/system/utils';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import dayjs from 'dayjs';
import { safeEncodeURIComponent } from '@/web/common/utils/uri';

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
  if (config.headers) {
  }

  return config;
}

/**
 * 请求成功,检查请求头
 */
function responseSuccess(response: AxiosResponse<ResponseDataType>) {
  return response;
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
function responseError(err: any) {
  console.log('error->', '请求错误', err);
  const pathname = window.location.pathname;
  const isOutlinkPage = {
    [`${subRoute}/chat/share`]: true,
    [`${subRoute}/price`]: true,
    [`${subRoute}/login`]: true
  }[pathname];

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

  // Token error
  if (data?.code in TOKEN_ERROR_CODE) {
    if (!isOutlinkPage && pathname !== `${subRoute}/chat`) {
      clearToken();
      window.location.replace(
        getWebReqUrl(
          `/login?lastRoute=${safeEncodeURIComponent(location.pathname + location.search)}`
        )
      );
    }

    return Promise.reject({ message: i18nT('common:unauth_token') });
  }
  // Blance error
  if (
    data?.statusText &&
    [
      TeamErrEnum.aiPointsNotEnough,
      TeamErrEnum.datasetSizeNotEnough,
      TeamErrEnum.datasetAmountNotEnough,
      TeamErrEnum.appAmountNotEnough,
      TeamErrEnum.pluginAmountNotEnough,
      TeamErrEnum.websiteSyncNotEnough,
      TeamErrEnum.reRankNotEnough
    ].includes(data?.statusText) &&
    !isOutlinkPage
  ) {
    useSystemStore.getState().setNotSufficientModalType(data.statusText);
    return Promise.reject(data);
  }
  return Promise.reject(data);
}

/* 创建请求实例 */
const instance = axios.create({
  timeout: 60000 // 超时时间
});

/* 请求拦截 */
instance.interceptors.request.use(startInterceptors, (err) => Promise.reject(err));
/* 响应拦截 */
instance.interceptors.response.use(responseSuccess, (err) => Promise.reject(err));

function request(
  url: string,
  data: any,
  { cancelToken, maxQuantity, withCredentials, ...config }: ConfigType,
  method: Method
): any {
  /* 去空 */
  for (const key in data) {
    const val = data[key];
    if (data[key] === undefined) {
      delete data[key];
    } else if (val instanceof Date) {
      data[key] = dayjs(val).format();
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
export function GET<T = undefined>(url: string, params = {}, config: ConfigType = {}): Promise<T> {
  return request(url, params, config, 'GET');
}

export function POST<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'POST');
}

export function PUT<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'PUT');
}

export function DELETE<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'DELETE');
}

export {
  maxQuantityMap,
  checkMaxQuantity,
  requestFinish,
  startInterceptors,
  responseSuccess,
  checkRes,
  responseError,
  instance,
  request
};
