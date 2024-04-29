import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { request } from 'https';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { path = [], ...query } = req.query as any;

    const queryStr = new URLSearchParams(query).toString();
    const requestPath = queryStr
      ? `/${path?.join('/')}?${new URLSearchParams(query).toString()}`
      : `/${path?.join('/')}`;

    if (!requestPath) {
      throw new Error('url is empty');
    }

    const lafEnv = global.feConfigs?.lafEnv;

    if (!lafEnv) {
      throw new Error('lafEnv is empty');
    }

    const parsedUrl = new URL(lafEnv);
    delete req.headers?.cookie;
    delete req.headers?.host;
    delete req.headers?.origin;

    const requestResult = request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: requestPath,
      method: req.method,
      headers: req.headers,
      timeout: 30000
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
