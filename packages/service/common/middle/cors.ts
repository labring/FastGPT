import type { NextApiResponse, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';
import { serviceEnv } from '../../env';

export async function withNextCors(req: NextApiRequest, res: NextApiResponse) {
  const methods = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];

  const allowedOrigins = serviceEnv.ALLOWED_ORIGINS?.split(',');
  const origin = req.headers.origin;

  await NextCors(req, res, {
    methods,
    origin: allowedOrigins || origin,
    optionsSuccessStatus: 200
  });
}
