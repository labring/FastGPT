import { jsonRes } from '../response';
import type { NextApiRequest, NextApiResponse } from 'next';
import { withNextCors } from './cors';
import { type ApiRequestProps } from '../../type/next';
import { getLogger, LogCategories, withContext } from '../logger';
import { ZodError } from 'zod';
import { randomUUID } from 'crypto';

export type NextApiHandler<T = any> = (
  req: ApiRequestProps,
  res: NextApiResponse<T>
) => unknown | Promise<unknown>;

export const NextEntry = ({
  beforeCallback = []
}: {
  beforeCallback?: ((req: NextApiRequest, res: NextApiResponse) => Promise<any>)[];
}) => {
  return (...args: NextApiHandler[]): NextApiHandler => {
    return async function api(req: ApiRequestProps, res: NextApiResponse) {
      const start = Date.now();
      const requestId = randomUUID();
      res.setHeader('x-request-id', requestId);

      const requestLogger = getLogger(LogCategories.HTTP.REQUEST);
      const responseLogger = getLogger(LogCategories.HTTP.RESPONSE);
      const errorLogger = getLogger(LogCategories.HTTP.ERROR);

      const url = req.url || '';
      const method = req.method?.toUpperCase() || '';
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const contentLength = req.headers['content-length'];

      return withContext({ requestId }, async () => {
        requestLogger.info(`[${method}] ${url}`, {
          verbose: false,
          requestId,
          method,
          url,
          ip,
          userAgent,
          contentLength
        });

        let responseLogged = false;
        const logResponse = (event: 'request-finish' | 'request-close') => {
          if (responseLogged) return;
          responseLogged = true;
          const durationMs = Date.now() - start;
          const httpStatusCode = res.statusCode;

          responseLogger.info(`[${method}] ${url} - ${httpStatusCode} in ${durationMs}ms`, {
            verbose: false,
            requestId,
            method,
            httpStatusCode,
            event
          });
        };

        res.once('finish', () => logResponse('request-finish'));
        res.once('close', () => logResponse('request-close'));

        try {
          await Promise.all([
            withNextCors(req, res),
            ...beforeCallback.map((item) => item(req, res))
          ]);

          let response = null;
          for await (const handler of args) {
            response = await handler(req, res);
            if (res.writableFinished) {
              break;
            }
          }

          const contentType = res.getHeader('Content-Type');
          if ((!contentType || contentType === 'application/json') && !res.writableFinished) {
            return jsonRes(res, {
              code: 200,
              data: response
            });
          }
        } catch (error) {
          // Handle Zod validation errors
          if (error instanceof ZodError) {
            errorLogger.warn('Request validation failed', {
              requestId,
              method,
              url,
              error
            });
            return jsonRes(res, {
              code: 400,
              message: 'Data validation error',
              error,
              url: req.url
            });
          }

          errorLogger.error('Request handler error', {
            requestId,
            method,
            url,
            error
          });

          return jsonRes(res, {
            code: 500,
            error,
            url: req.url
          });
        }
      });
    };
  };
};
