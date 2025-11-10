import type { NextApiRequest, NextApiResponse } from 'next';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

export type NextApiHandler<T = any> = (
  req: ApiRequestProps,
  res: NextApiResponse<T>
) => unknown | Promise<unknown>;

/**
 * Marketplace 专用的轻量级 API 包装器
 * 避免引入主应用中的 MongoDB 和认证相关依赖
 */
export const NextAPI = (...handlers: NextApiHandler[]): NextApiHandler => {
  return async function api(req: ApiRequestProps, res: NextApiResponse) {
    try {
      // 设置 CORS 头
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }

      let response = null;
      for await (const handler of handlers) {
        response = await handler(req, res);
        if (res.writableFinished) {
          break;
        }
      }

      // 如果响应还未结束，返回 JSON 格式
      if (!res.writableFinished) {
        res.status(200).json({
          code: 200,
          data: response
        });
      }
    } catch (error) {
      console.error('Marketplace API Error:', error);

      if (!res.writableFinished) {
        res.status(500).json({
          code: 500,
          message: (error as Error)?.message || 'Internal Server Error'
        });
      }
    }
  };
};
