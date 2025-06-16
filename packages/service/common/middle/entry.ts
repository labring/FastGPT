import { jsonRes } from '../response';
import type { NextApiResponse } from 'next';
import { withNextCors } from './cors';
import { ApiRequestProps } from '../../type/next';
import { addLog } from '../system/log';
import { ERROR_RESPONSE, ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { clearCookie } from '../../support/permission/controller';

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
      } catch (error: any) {
        const requestUrl = req.url;

        let httpStatusCode = 500;
        let responseMessage = 'Internal Server Error';
        let errorForClient: any = error; // This will be sent in the 'error' field of jsonRes
        let structuredErrorDefinitionFound = false;

        if (error) {
          let errorKey: string | undefined = undefined;
          if (typeof error === 'string') {
            errorKey = error;
          } else if (error.statusText && typeof error.statusText === 'string') {
            errorKey = error.statusText;
          } else if (error.message && typeof error.message === 'string') {
            errorKey = error.message;
          }

          if (errorKey && ERROR_RESPONSE[errorKey]) {
            const structuredError = ERROR_RESPONSE[errorKey];
            httpStatusCode = structuredError.code;
            responseMessage = structuredError.message;
            errorForClient = structuredError; // Send the structured error to client
            structuredErrorDefinitionFound = true;

            if (errorKey === ERROR_ENUM.unAuthorization) {
              clearCookie(res);
            }
          }
        }

        // Fallback if not a recognized structured error but error object has code/message
        if (
          !structuredErrorDefinitionFound &&
          error &&
          typeof error.code === 'number' &&
          typeof error.message === 'string'
        ) {
          httpStatusCode = error.code;
          responseMessage = error.message;
          // errorForClient remains the original error object
        } else if (!structuredErrorDefinitionFound && error && typeof error.message === 'string') {
          // If only a message string is available on the error object
          responseMessage = error.message;
          // errorForClient remains the original error object
        }

        const logMessage = `Api response error: ${requestUrl} - Status: ${httpStatusCode} - Message: ${responseMessage}`;
        addLog.error(logMessage, error); // Pass combined message and the original error object

        return jsonRes(res, {
          code: httpStatusCode,
          message: responseMessage, // Pass the determined message
          error: errorForClient, // Pass the original or structured error
          url: requestUrl
        });
      }
    };
  };
};
