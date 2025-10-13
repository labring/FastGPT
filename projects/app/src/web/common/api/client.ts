import { createFastGPTClient } from '@fastgpt/global/common/tsRest/fastgpt/client';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ApiFetcherArgs } from '@ts-rest/core';
import { tsRestFetchApi } from '@ts-rest/core';
import { AnyResponseSchema } from '@fastgpt/global/common/tsRest/type';
import { ZodError } from 'zod';
import { getWebReqUrl, subRoute } from '@fastgpt/web/common/system/utils';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useSystemStore } from '../system/useSystemStore';
import { clearToken } from '@/web/support/user/auth';

const queue = new Map<string, { id: string; controller: AbortController }[]>();
type BeforeFetchOptions = ApiFetcherArgs & { max?: number };
const beforeFetch = (
  options: BeforeFetchOptions
):
  | {
      limit: { id: string; url: string; release: () => void };
    }
  | undefined => {
  const checkMaxRequestLimitation = (options: {
    url: string;
    max: number;
  }): {
    id: string;
    signal: AbortSignal;
    release: () => void;
  } => {
    const { url, max } = options;
    const id = getNanoid();
    const controller = new AbortController();
    const item = queue.get(url);

    const current = item ?? [];
    if (current.length >= max) {
      const first = current.shift()!;
      first.controller.abort();
    }

    current.push({ id, controller });
    if (!item) queue.set(url, current);

    const release = () => {
      const item = queue.get(url);
      if (!item) return;

      const index = item.findIndex((item) => item.id === id);
      if (index !== -1) {
        item.splice(index, 1);
      }

      if (item.length <= 0) {
        queue.delete(url);
      }
    };

    return { id, signal: controller.signal, release };
  };

  const { max, ...args } = options;
  if (!max || max <= 0) return;

  const { id, signal, release } = checkMaxRequestLimitation({ url: args.path, max });
  args.fetchOptions ??= {};
  args.fetchOptions.signal = signal;

  return {
    limit: { id, url: args.path, release }
  };
};

const afterFetch = (response: Awaited<ReturnType<typeof tsRestFetchApi>>) => {
  if (response.status === 200) {
    try {
      const data = AnyResponseSchema.parse(response.body);

      if (data === undefined) {
        console.log('error->', data, 'data is empty');
        return Promise.reject('服务器异常');
      } else if (data.code < 200 || data.code >= 400) {
        return Promise.reject(data);
      }

      response.body = data.data;

      return response;
    } catch (error) {
      if (error instanceof ZodError) {
        return Promise.reject(error.message);
      }

      return Promise.reject('Unknown error while intercept response');
    }
  } else {
    return Promise.reject(response);
  }
};
const requestFinish = (prepare?: ReturnType<typeof beforeFetch>) => {
  prepare?.limit?.release?.();
};

const responseError = (err: any) => {
  console.log('error->', '请求错误', err);
  const isOutlinkPage =
    typeof window !== 'undefined' &&
    {
      [`${subRoute}/chat/share`]: true,
      [`${subRoute}/chat`]: true,
      [`${subRoute}/login`]: true
    }[window.location.pathname];

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

  // 有报错响应
  if (data?.code in TOKEN_ERROR_CODE) {
    if (!isOutlinkPage && typeof window !== 'undefined') {
      clearToken();
      window.location.replace(
        getWebReqUrl(`/login?lastRoute=${encodeURIComponent(location.pathname + location.search)}`)
      );
    }

    return Promise.reject({ message: i18nT('common:unauth_token') });
  }
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
};

export const client = createFastGPTClient({
  baseUrl:
    typeof window === 'undefined'
      ? 'http://localhost:3000/api' // For Node.js test environment
      : getWebReqUrl('/api'),
  throwOnUnknownStatus: true,
  validateResponse: false,
  credentials: 'include',
  baseHeaders: {
    'Content-Type': 'application/json;charset=utf-8'
  },
  api: tsRestFetchApi
});

// Simplified types to reduce TS computation overhead
type AnyEndpointFn = (options?: any) => Promise<any>;

// Helper to extract the successful response (status: 200)
type ExtractSuccessResponse<T extends AnyEndpointFn> = Extract<
  Awaited<ReturnType<T>>,
  { status: 200 }
>;

// Helper to infer response body type, extracting data from body if it exists
type InferResponseBody<T extends AnyEndpointFn> =
  ExtractSuccessResponse<T> extends {
    body: infer B;
  }
    ? B extends { data: infer D }
      ? D
      : B
    : never;

// Helper to infer options type
type InferOptions<T extends AnyEndpointFn> = NonNullable<Parameters<T>[0]>;

// Helper to extract body from options
type InferBody<T extends AnyEndpointFn> = InferOptions<T> extends { body: infer B } ? B : never;

// Helper to extract query from options
type InferQuery<T extends AnyEndpointFn> = InferOptions<T> extends { query: infer Q } ? Q : never;

// Combined params type
type Params<T extends AnyEndpointFn> = (InferBody<T> extends never ? {} : InferBody<T>) &
  (InferQuery<T> extends never ? {} : InferQuery<T>);

// Additional options (excluding body and query)
type Options<T extends AnyEndpointFn> = Omit<InferOptions<T>, 'body' | 'query'>;

const call = async <T extends AnyEndpointFn>(
  api: T,
  options: InferOptions<T>
): Promise<InferResponseBody<T>> => {
  const prepare = beforeFetch(options as any);

  const res = await api(options)
    .then(afterFetch)
    .catch(responseError)
    .finally(() => requestFinish(prepare));

  return res.body as InferResponseBody<T>;
};

export const RestAPI = <T extends AnyEndpointFn>(
  endpoint: T,
  transform?: (params: Params<T>) => {
    body?: InferBody<T> extends never ? any : InferBody<T>;
    query?: InferQuery<T> extends never ? any : InferQuery<T>;
  }
): ((params?: Params<T>, options?: Options<T>) => Promise<InferResponseBody<T>>) => {
  return (params?: Params<T>, options?: Options<T>): Promise<InferResponseBody<T>> => {
    const transformedData = params && transform ? transform(params) : {};
    const finalOptions = { ...options, ...transformedData } as InferOptions<T>;

    return call(endpoint, finalOptions);
  };
};
