import { NextEntry } from '@fastgpt/service/common/middle/entry';

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
          data: body,
          message: '',
          statusText: ''
        }
      } as any;
    } catch (error) {
      const duration = Date.now() - start;

      // 使用统一的错误处理逻辑
      const processedError = processError({
        error,
        url,
        defaultCode: 500
      });

      // 如果需要清除 cookie
      if (processedError.shouldClearCookie) {
        clearCookie(args.res);
      }

      return {
        status: 200 as const,
        body: {
          code: processedError.code,
          statusText: processedError.statusText,
          message: processedError.message,
          data: processedError.data
        }
      } as any;
    }
  }) as unknown as Endpoint<T>;
}
