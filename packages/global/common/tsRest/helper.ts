import { TOKEN_ERROR_CODE } from '../error/errorCode';
import { getWebReqUrl } from '../../../web/common/system/utils';
import { getNanoid } from '../string/tools';
import type { ApiFetcherArgs, tsRestFetchApi } from '@ts-rest/core';
import { AnyResponseSchema } from './schemas/common';
import { ZodError } from 'zod';
import type { RouterOfIndexContract } from './types';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { generateOpenApi } from '@ts-rest/open-api';

const WHITE_LIST = ['/chat/share', '/chat', '/login'];
function isTokenExpired() {
  if (WHITE_LIST.includes(window.location.pathname)) return;

  // TODO: log out here
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
const Queue = new Map<string, Item[]>();
export function checkMaxRequestLimitation(options: { url: string; max: number }): {
  id: string;
  signal: AbortSignal;
  release: () => void;
} {
  const { url, max } = options;
  const id = getNanoid();
  const controller = new AbortController();
  const item = Queue.get(url);

  const current = item ?? [];
  if (current.length >= max) {
    const first = current.shift()!;
    first.controller.abort();
  }
  current.push({ id, controller });
  if (!item) Queue.set(url, current);

  const release = () => {
    const item = Queue.get(url);
    if (!item) return;

    const index = item.findIndex((item) => item.id === id);
    if (index !== -1) {
      item.splice(index, 1);
    }

    if (item.length <= 0) {
      Queue.delete(url);
    }
  };

  return { id, signal: controller.signal, release };
}

export function checkHttpStatus(status: number): status is 200 {
  if (status !== 200) return false;
  return true;
}

export type BeforeFetchOptions = ApiFetcherArgs & { max?: number };
export function beforeFetch(options: BeforeFetchOptions):
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

export function afterFetch(
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
