import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import type { NextApiRequest, NextApiResponse } from '@fastgpt/next/type';
import { onTestFinished, vi } from 'vitest';

/**
 * 构造真实 Node HTTP 载体上的类型化 NextApiRequest / NextApiResponse 测试夹具。
 * 统一封装 Next 响应方法与 Socket 生命周期释放，供各 API 路由单测复用，避免局部对象强转。
 */
export const createNextHttpContext = ({
  method = 'POST',
  url,
  body,
  query = {}
}: {
  method?: string;
  url: string;
  body?: unknown;
  query?: NextApiRequest['query'];
}): { req: NextApiRequest; res: NextApiResponse } => {
  const socket = new Socket();
  const req: NextApiRequest = Object.assign(new IncomingMessage(socket), {
    method,
    url,
    cookies: {},
    env: {},
    body,
    query
  });

  function redirect(targetUrl: string): NextApiResponse;
  function redirect(status: number, targetUrl: string): NextApiResponse;
  function redirect(): NextApiResponse {
    return res;
  }

  const res: NextApiResponse = Object.assign(new ServerResponse(req), {
    send: vi.fn(() => undefined),
    json: vi.fn(() => undefined),
    status(statusCode: number) {
      res.statusCode = statusCode;
      return res;
    },
    redirect,
    setDraftMode: () => res,
    setPreviewData: () => res,
    clearPreviewData: () => res,
    revalidate: async () => undefined
  });

  onTestFinished(() => {
    res.destroy();
    socket.destroy();
  });

  return { req, res };
};
