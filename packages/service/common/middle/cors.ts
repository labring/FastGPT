import type { NextApiResponse, NextApiHandler, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';

export function withNextCors(handler: NextApiHandler): NextApiHandler {
  return async function nextApiHandlerWrappedWithNextCors(
    req: NextApiRequest,
    res: NextApiResponse
  ) {
    const methods = ['GET', 'eHEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];
    const origin = req.headers.origin;
    await NextCors(req, res, {
      methods,
      origin: origin,
      optionsSuccessStatus: 200
    });

    return handler(req, res);
  };
}
