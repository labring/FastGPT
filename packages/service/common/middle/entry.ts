import { jsonRes } from '../response';
import type { NextApiRequest, NextApiResponse } from 'next';
import { withNextCors } from './cors';
import { type ApiRequestProps } from '../../type/next';
import { addLog } from '../system/log';
import { withCSRFCheck } from './csrf';

export type NextApiHandler<T = any> = (
  req: ApiRequestProps,
  res: NextApiResponse<T>
) => unknown | Promise<unknown>;

type NextAPIOptsType = {
  isCSRFCheck: boolean;
};
type Args = [...NextApiHandler[], NextAPIOptsType] | NextApiHandler[];

export const NextEntry = ({
  beforeCallback = []
}: {
  beforeCallback?: ((req: NextApiRequest, res: NextApiResponse) => Promise<any>)[];
}) => {
  return (...args: Args): NextApiHandler => {
    const opts = (() => {
      if (typeof args.at(-1) === 'function') {
        return {
          isCSRFCheck: true
        } as NextAPIOptsType;
      }
      return args.at(-1) as NextAPIOptsType;
    })();
    return async function api(req: ApiRequestProps, res: NextApiResponse) {
      const start = Date.now();
      addLog.debug(`Request start ${req.url}`);

      try {
        await Promise.all([
          withNextCors(req, res),
          withCSRFCheck(req, res, opts.isCSRFCheck),
          ...beforeCallback.map((item) => item(req, res))
        ]);

        let response = null;
        for await (const handler of args) {
          if (typeof handler === 'function') response = await handler(req, res);
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
