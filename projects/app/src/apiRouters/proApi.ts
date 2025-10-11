import type { Handler } from '@fastgpt/global/common/tsRest/type';
import { RestAPI } from '@/service/middleware/entry';
import { request } from 'http';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

const handler: Handler<any> = async ({ req, res }) => {
  return new Promise((resolve, reject) => {
    try {
      const requestPath = req.url || '';

      if (!requestPath) {
        throw new Error('url is empty');
      }
      if (!FastGPTProUrl) {
        throw new Error(`未配置商业版链接: ${requestPath}`);
      }

      const parsedUrl = new URL(FastGPTProUrl);

      // 删除敏感的 header
      const requestHeaders = { ...req.headers };
      delete requestHeaders?.rootkey;

      const requestResult = request({
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: requestPath,
        method: req.method,
        headers: requestHeaders
      });

      req.pipe(requestResult);

      requestResult.on('response', (response) => {
        Object.keys(response.headers).forEach((key) => {
          // @ts-ignore
          res.setHeader(key, response.headers[key]);
        });
        response.statusCode && res.writeHead(response.statusCode);
        response.pipe(res);

        // 代理完成后 resolve
        response.on('end', () => {
          resolve({} as any);
        });
      });

      requestResult.on('error', (e) => {
        reject(e);
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const proApi = RestAPI(handler);
