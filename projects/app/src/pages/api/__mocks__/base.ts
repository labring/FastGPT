import { TestRequest } from '@/test/utils';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

jest.mock('@fastgpt/service/common/mongo');
jest.mock('@fastgpt/service/common/system/log');

jest.mock('@/service/middleware/entry', () => {
  return {
    NextAPI: () => {
      return (...args: any) => {
        return async function api(req: any, res: any) {
          try {
            let response = null;
            for (const handler of args) {
              response = await handler(req, res);
            }
            return {
              code: 200,
              data: response
            };
          } catch (error) {
            return {
              code: 500,
              error
            };
          }
        };
      };
    }
  };
});

// req,
// authToken = false,
// authRoot = false,
// authApiKey = false
jest.mock('@fastgpt/service/support/permission/controller.ts', () => {
  return {
    parseHeaderCert: async ({
      req,
      authToken = false,
      authRoot = false,
      authApiKey = false
    }: {
      req: TestRequest;
      authToken?: boolean;
      authRoot?: boolean;
      authApiKey?: boolean;
    }) => {
      if (authToken) {
        const token = req.headers?.cookie?.token;
        if (!token) {
          return Promise.reject(ERROR_ENUM.unAuthorization);
        }
        return token;
      }
      if (authRoot) {
        // TODO: unfinished
        return req.headers.rootkey;
      }
      if (authApiKey) {
        // TODO: unfinished
        return req.headers.authorization;
      }
      return null;
    }
  };
});
