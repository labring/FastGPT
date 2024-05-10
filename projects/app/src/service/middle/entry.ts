import { jsonRes } from '@fastgpt/service/common/response';
import type { NextApiResponse, NextApiHandler, NextApiRequest } from 'next';
import { connectToDatabase } from '../mongo';
import { withNextCors } from '@fastgpt/service/common/middle/cors';

export const NextAPI = (...args: NextApiHandler[]): NextApiHandler => {
  return async function api(req: NextApiRequest, res: NextApiResponse) {
    try {
      await Promise.all([withNextCors(req, res), connectToDatabase()]);

      let response = null;
      for (const handler of args) {
        response = await handler(req, res);
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
