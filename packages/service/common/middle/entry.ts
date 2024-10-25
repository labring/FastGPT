import { jsonRes } from '../response';
import type { NextApiResponse } from 'next';
import { withNextCors } from './cors';
import { ApiRequestProps } from '../../type/next';
import { addLog } from '../system/log';

export type NextApiHandler<T = any> = (
  req: ApiRequestProps,
  res: NextApiResponse<T>
) => unknown | Promise<unknown>;

export const NextEntry = ({ beforeCallback = [] }: { beforeCallback?: Promise<any>[] }) => {
  return (...args: NextApiHandler[]): NextApiHandler => {
    return async function api(req: ApiRequestProps, res: NextApiResponse) {
      const start = Date.now();
      addLog.debug(`Request start ${req.url}`);

      try {
        await Promise.all([withNextCors(req, res), ...beforeCallback]);

        let response = null;
        for await (const handler of args) {
          response = await handler(req, res);
          if (res.writableFinished) {
            break;
          }
        }

        // Get request duration
        const duration = Date.now() - start;
        if (duration < 2000) {
          addLog.debug(`Request finish ${req.url}, time: ${duration}ms`);
        } else {
          addLog.warn(`Request finish ${req.url}, time: ${duration}ms`);
        }

        const contentType = res.getHeader('Content-Type');
        if ((!contentType || contentType === 'application/json') && !res.writableFinished) {
          return jsonRes(res, {
            code: 200,
            data: response
          });
        }
      } catch (error) {
        return jsonRes(res, {
          code: 500,
          error,
          url: req.url
        });
      }
    };
  };
};
