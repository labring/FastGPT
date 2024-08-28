import type { NextApiResponse, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';

export async function withNextCors(req: NextApiRequest, res: NextApiResponse) {
  const methods = ['GET', 'eHEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];
  const origin = req.headers.origin;
  await NextCors(req, res, {
    methods,
    origin: origin,
    optionsSuccessStatus: 200
  });
}
