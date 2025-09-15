import { contract } from './contract';
import { initClient, tsRestFetchApi } from '@ts-rest/core';
import { getWebReqUrl } from '../../../web/common/system/utils';
import { afterFetch, beforeFetch, type BeforeFetchOptions } from './helper';

export const client = initClient(contract, {
  baseUrl: getWebReqUrl('/api'),
  throwOnUnknownStatus: true,
  validateResponse: false,
  credentials: 'include',
  baseHeaders: {
    'Content-Type': 'application/json;charset=utf-8'
  },
  api: async (args: BeforeFetchOptions) => {
    const prepare = beforeFetch(args);
    const response = await tsRestFetchApi(args);
    return afterFetch(response, prepare);
  }
});

type Client = typeof client;
type U<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : U<T[K]> }[keyof T];
type E = U<Client>;
type Result<T> =
  T extends Promise<infer R> ? (R extends { status: 200; body: infer B } ? B : never) : never;

export const RestAPI = <T extends E>(
  api: T
): ((...args: Parameters<T>) => Promise<Result<ReturnType<T>>>) => {
  return async (...args: Parameters<T>) => {
    const res = await api(...args);

    if (res.status !== 200) {
      throw new Error(`Unexpected status: ${res.status}`);
    }

    return res.body as Result<ReturnType<T>>;
  };
};
