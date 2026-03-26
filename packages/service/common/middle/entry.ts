import { jsonRes } from '../response';
import type { NextApiRequest, NextApiResponse } from 'next';
import { SpanStatusCode } from '@opentelemetry/api';
import { withNextCors } from './cors';
import { type ApiRequestProps } from '../../type/next';
import { getLogger, LogCategories, withContext } from '../logger';
import { setSpanError, withActiveSpan } from '../tracing';
import { ZodError } from 'zod';
import { randomUUID } from 'crypto';

export type NextApiHandler<T = any> = (
  req: ApiRequestProps,
  res: NextApiResponse<T>
) => unknown | Promise<unknown>;

function isIdLikeRouteSegment(segment: string) {
  return (
    /^\d{4,}$/.test(segment) ||
    /^[0-9a-f]{24}$/i.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment) ||
    /^[A-Za-z0-9_-]{16,}$/.test(segment)
  );
}

function normalizeRouteSegment(segment: string) {
  return isIdLikeRouteSegment(segment) ? ':id' : segment;
}

function parseHeaderNumber(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getRequestRoute(url: string) {
  const [route = '/'] = url.split('?');
  if (!route || route === '/') return '/';

  return route
    .split('/')
    .map((segment) => normalizeRouteSegment(segment))
    .join('/');
}

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

      const url = req.url || '';
      const route = getRequestRoute(url);
      const method = req.method?.toUpperCase() || '';
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const contentLength = req.headers['content-length'];
      const requestBodySize = parseHeaderNumber(contentLength);

      return withContext({ requestId }, async () =>
        withActiveSpan(
          {
            name: 'http.request',
            tracerName: 'fastgpt.http',
            attributes: {
              'http.request.method': method,
              'http.route': route,
              'http.request.body.size': requestBodySize
            }
          },
          async (span) => {
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
                const jsonResponse = await jsonRes(res, {
                  code: 200,
                  data: response
                });

                span.setAttribute('http.response.status_code', res.statusCode);
                return jsonResponse;
              }

              span.setAttribute('http.response.status_code', res.statusCode);
            } catch (error) {
              // Handle Zod validation errors
              if (error instanceof ZodError) {
                span.setAttribute('http.response.status_code', 400);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: 'Data validation error'
                });

                return jsonRes(res, {
                  code: 400,
                  message: 'Data validation error',
                  error,
                  url: req.url
                });
              }

              span.setAttribute('http.response.status_code', 500);
              setSpanError(span, error);

              return jsonRes(res, {
                code: 500,
                error,
                url: req.url
              });
            }
          }
        )
      );
    };
  };
};
