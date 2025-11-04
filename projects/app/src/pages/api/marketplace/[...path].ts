import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';

import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { path = [], ...query } = req.query as any;

    const queryStr = new URLSearchParams(query).toString();
    const requestPath = queryStr
      ? `/${path?.join('/')}?${new URLSearchParams(query).toString()}`
      : `/${path?.join('/')}`;

    if (!requestPath) {
      throw new Error('url is empty');
    }

    const marketplaceUrl = process.env.MARKETPLACE_URL || 'https://marketplace.fastgpt.cn';

    if (!marketplaceUrl) {
      throw new Error('MARKETPLACE_URL is not configured');
    }

    const parsedUrl = new URL(marketplaceUrl);
    delete req.headers?.cookie;
    delete req.headers?.host;
    delete req.headers?.origin;

    // 根据协议选择对应的 request 方法
    const request = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

    const requestResult = request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: requestPath,
      method: req.method,
      headers: req.headers,
      timeout: 60000
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
      res.send(e);
      res.end();
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
