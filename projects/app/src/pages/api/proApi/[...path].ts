import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';

import { request } from 'http';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { path = [], ...query } = req.query as any;
    if (!FastGPTProUrl) {
      // If Pro URL is not configured, return a success response indicating the feature is not available
      return jsonRes(res, {
        code: 200,
        data: null,
        message: 'Pro features are not configured or disabled.'
      });
    }
    const requestPath = `/api/${path?.join('/')}?${new URLSearchParams(query).toString()}`;

    if (!requestPath) {
      return jsonRes(res, { code: 400, error: 'Request path is empty' });
    }

    const parsedUrl = new URL(FastGPTProUrl);
    delete req.headers?.rootkey;

    const requestResult = request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: requestPath,
      method: req.method,
      headers: req.headers
    });
    req.pipe(requestResult);

    requestResult.on('response', (response) => {
      Object.keys(response.headers).forEach((key) => {
        // @ts-ignore
        res.setHeader(key, response.headers[key]);
      });
      response.statusCode && res.writeHead(response.statusCode);
      response.pipe(res);
    });

    requestResult.on('error', (e) => {
      // Log the proxy error on the server side for debugging
      console.error('Pro API proxy error:', e);
      // Send a generic error to the client
      jsonRes(res, { code: 502, error: 'Error proxying to Pro service.' });
    });
  } catch (error: any) {
    console.error('Error in proApi handler:', error);
    jsonRes(res, {
      code: 500,
      error: error?.message || 'Internal server error in proApi handler.'
    });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
