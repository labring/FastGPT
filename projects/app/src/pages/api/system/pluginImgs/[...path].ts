import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { request } from 'http';
import { FastGPTPluginUrl } from '@fastgpt/service/common/system/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { path = [] } = req.query as any;
    const requestPath = `/imgs/tools/${path?.join('/')}`;

    if (!requestPath) {
      throw new Error('url is empty');
    }
    if (!FastGPTPluginUrl) {
      throw new Error(`未配置插件服务链接: ${path}`);
    }

    const parsedUrl = new URL(FastGPTPluginUrl);
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
