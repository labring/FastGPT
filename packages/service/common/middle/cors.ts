import type { NextApiResponse, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';

export async function withNextCors(req: NextApiRequest, res: NextApiResponse) {
  const methods = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',');
  const origin = req.headers.origin;

  await NextCors(req, res, {
    methods,
    origin: allowedOrigins || origin,
    optionsSuccessStatus: 200
  });
}
