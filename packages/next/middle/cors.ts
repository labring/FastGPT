import type { NextApiResponse, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';

/** 为 Next Pages API 请求应用 CORS，并允许应用层传入来源白名单。 */
export async function withNextCors({
  req,
  res,
  allowedOrigins
}: {
  req: NextApiRequest;
  res: NextApiResponse;
  allowedOrigins?: string[];
}) {
  const methods = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];

  const origin = req.headers.origin;

  await NextCors(req, res, {
    methods,
    origin: allowedOrigins || origin,
    optionsSuccessStatus: 200
  });
}
