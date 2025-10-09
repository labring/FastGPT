import { contract } from './contract';
import { initClient, tsRestFetchApi } from '@ts-rest/core';
import { getWebReqUrl } from '../../../web/common/system/utils';
import { TOKEN_ERROR_CODE } from '../error/errorCode';
import { getNanoid } from '../string/tools';
import { type ApiFetcherArgs } from '@ts-rest/core';
import { AnyResponseSchema } from './types';
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

  // client.support.user.logout();
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
export type Endpoints = U<Client>;
type _Options<T extends Endpoints> = NonNullable<Parameters<T>[0]>;
type ExtractBodySchema<T extends Endpoints> = 'body' extends keyof _Options<T>
  ? _Options<T>['body']
  : never;
type ExtractQuerySchema<T extends Endpoints> = 'query' extends keyof _Options<T>
  ? _Options<T>['query']
  : never;
export type Params<T extends Endpoints> = (ExtractBodySchema<T> extends never
  ? {}
  : ExtractBodySchema<T>) &
  (ExtractQuerySchema<T> extends never ? {} : ExtractQuerySchema<T>);
export type Options<T extends Endpoints> = Omit<_Options<T>, 'body' | 'query'>;
type Body<T extends Endpoints> = Extract<Awaited<ReturnType<T>>, { status: 200 }>['body'];
type RestAPIResult<T extends Endpoints> = Body<T>;

const call = async <T extends Endpoints>(
  api: T,
  options: _Options<T>
): Promise<RestAPIResult<T>> => {
  const res = await api(options as any);

  if (res.status !== 200) {
    throw new Error(`Unexpected status: ${res.status}`);
  }

  return res.body as RestAPIResult<T>;
};

export const RestAPI = <T extends Endpoints>(endpoint: T) => {
  return (params?: Params<T>, options?: Options<T>) => {
    const finalOptions = {
      ...options,
      ...(params && Object.keys(params).length > 0 ? { body: params, query: params } : {})
    } as _Options<T>;

    return call(endpoint, finalOptions);
  };
};
