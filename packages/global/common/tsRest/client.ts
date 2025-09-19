import { contract } from './contract';
import { initClient, tsRestFetchApi } from '@ts-rest/core';
import { getWebReqUrl } from '../../../web/common/system/utils';
import { TOKEN_ERROR_CODE } from '../error/errorCode';
import { getNanoid } from '../string/tools';
import { type ApiFetcherArgs } from '@ts-rest/core';
import { AnyResponseSchema } from '../type';
import { ZodError } from 'zod';

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

const WHITE_LIST = ['/chat/share', '/chat', '/login'];
function isTokenExpired() {
  if (WHITE_LIST.includes(window.location.pathname)) return;

  client.support.user.logout();
  const lastRoute = encodeURIComponent(location.pathname + location.search);
  window.location.replace(getWebReqUrl(`/login?lastRoute=${lastRoute}`));
}

export function checkBusinessCode(code: number) {
  if (code in TOKEN_ERROR_CODE) {
    isTokenExpired();
    return;
  }
}

type Item = { id: string; controller: AbortController };
const queue = new Map<string, Item[]>();
function checkMaxRequestLimitation(options: { url: string; max: number }): {
  id: string;
  signal: AbortSignal;
  release: () => void;
} {
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
}

function checkHttpStatus(status: number): status is 200 {
  if (status !== 200) return false;
  return true;
}

type BeforeFetchOptions = ApiFetcherArgs & { max?: number };
function beforeFetch(options: BeforeFetchOptions):
  | {
      limit: { id: string; url: string; release: () => void };
    }
  | undefined {
  const { max, ...args } = options;
  if (!max || max <= 0) return;

  const { id, signal, release } = checkMaxRequestLimitation({ url: args.path, max });
  args.fetchOptions ??= {};
  args.fetchOptions.signal = signal;

  return {
    limit: { id, url: args.path, release }
  };
}

function afterFetch(
  response: Awaited<ReturnType<typeof tsRestFetchApi>>,
  prepare?: ReturnType<typeof beforeFetch>
) {
  if (checkHttpStatus(response.status)) {
    try {
      const body = AnyResponseSchema.parse(response.body);

      response.body = body.data;

      if (prepare?.limit) {
        prepare.limit.release();
      }

      return response;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(error.message);
      }

      throw new Error('Unknown error while intercept response');
    }
  } else {
    throw new Error(`HTTP error, status: ${response.status}`);
  }
}

type Client = typeof client;
type U<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : U<T[K]> }[keyof T];
type Endpoints = U<Client>;
type Options<T extends Endpoints> = NonNullable<Parameters<T>[0]>;
type RestAPIParameters<T extends Endpoints> = 'body' extends keyof Options<T>
  ? [body?: Options<T>['body'], options?: Omit<Options<T>, 'body'>]
  : [options?: Parameters<T>[0]];
type Ok<T extends Endpoints> = Extract<Awaited<ReturnType<T>>, { status: 200 }>['body'];
type RestAPIResult<T extends Endpoints> = Ok<T> extends { data: infer D } ? D : Ok<T>;

/**
 *
 * @param api 接收的 client 合约的 api
 * @param prepare 预设的参数
 * @returns 返回接口函数
 */
export const RestAPI = <T extends Endpoints>(
  api: T,
  prepare?: Parameters<T>[0]
): ((...args: RestAPIParameters<T>) => Promise<RestAPIResult<T>>) => {
  return async (...args: RestAPIParameters<T>) => {
    if (args.length > 2) throw new Error('RestAPI only accepts 0, 1 or 2 arguments');

    const options = (() => {
      let body: any;
      if (prepare && 'body' in prepare) {
        body = { ...prepare.body };
      }
      if (args.length > 0) {
        body = { ...body, ...args[0] };
      }
      if (args.length === 2) {
        return { ...prepare, body, ...args[1] };
      }
      return { ...prepare, body };
    })();

    const res = await api(options as Parameters<T>[0]);

    if (res.status !== 200) {
      throw new Error(`Unexpected status: ${res.status}`);
    }

    return res.body as RestAPIResult<T>;
  };
};
