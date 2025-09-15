import { NextEntry } from '@fastgpt/service/common/middle/entry';
import type { AppRoute, Args, Handler, Endpoint } from '@fastgpt/global/common/tsRest/types';
import { addLog } from '@fastgpt/service/common/system/log';
import { withNextCors } from '@fastgpt/service/common/middle/cors';

export const NextAPI = NextEntry({ beforeCallback: [] });

export function RestAPI<T extends AppRoute>(handler: Handler<T>): Endpoint<T> {
  return (async (args: Args<T>) => {
    const start = Date.now();
    const url = `${args.req?.method || 'Unknown'} ${args.req?.url || 'Unknown'}`;
    addLog.debug(`RestAPI Request start ${url}`);

    await Promise.all([withNextCors(args.req, args.res)]);

    try {
      const body = await handler(args);

      // Get request duration
      const duration = Date.now() - start;
      if (duration < 2000) {
        addLog.debug(`RestAPI Request finish ${url}, time: ${duration}ms`);
      } else {
        addLog.warn(`RestAPI Request finish ${url}, time: ${duration}ms`);
      }

      return {
        status: 200 as const,
        body: {
          code: 200,
          message: 'success',
          data: body,
          statusText: 'success'
        }
      } as any;
    } catch (error) {
      const duration = Date.now() - start;
      addLog.error(`RestAPI Request error ${url}, time: ${duration}ms`, error);

      return {
        status: 200 as const,
        body: {
          code: 500,
          message: 'Internal Server Error',
          error: error instanceof Error ? error.message : 'Unknown error',
          statusText: 'error'
        }
      } as any;
    }
  }) as unknown as Endpoint<T>;
}
