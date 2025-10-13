import type { Handler } from '@fastgpt/global/common/tsRest/type';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

const handler: Handler<any> = async ({ req, res, headers: _headers }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const requestPath = (req.url || '').replace('/proApi', '');

      if (!requestPath) {
        throw new Error('url is empty');
      }
      if (!FastGPTProUrl) {
        throw new Error(`未配置商业版链接: ${requestPath}`);
      }

      const parsedUrl = new URL(FastGPTProUrl);

      // 删除敏感的 header
      const headers = new Headers(_headers as Record<string, string>);
      headers.delete('rootkey');

      const response = await fetch(`${parsedUrl.origin}${requestPath}`, {
        headers,
        method: req.method,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body)
      });

      resolve({
        status: response.status,
        body: await response.json()
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const proApi: (...args: any[]) => Promise<any> = handler;
