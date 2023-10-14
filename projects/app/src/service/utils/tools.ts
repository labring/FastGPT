import type { NextApiResponse, NextApiHandler, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';
import { generateQA } from '../events/generateQA';
import { generateVector } from '../events/generateVector';

/* set cookie */
export const setCookie = (res: NextApiResponse, token: string) => {
  res.setHeader(
    'Set-Cookie',
    `token=${token}; Path=/; HttpOnly; Max-Age=604800; Samesite=None; Secure;`
  );
};
/* clear cookie */
export const clearCookie = (res: NextApiResponse) => {
  res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0');
};

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

/* start task */
export const startQueue = () => {
  if (!global.systemEnv) return;
  for (let i = 0; i < global.systemEnv.qaMaxProcess; i++) {
    generateQA();
  }
  for (let i = 0; i < global.systemEnv.vectorMaxProcess; i++) {
    generateVector();
  }
};

export const sseResponse = ({
  res,
  event,
  data
}: {
  res: NextApiResponse;
  event?: string;
  data: string;
}) => {
  if (res.closed) return;
  event && res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
};

/* add logger */
export const addLog = {
  info: (msg: string, obj?: Record<string, any>) => {
    global.logger?.info(msg, { meta: obj });
  },
  error: (msg: string, error?: any) => {
    global.logger?.error(msg, {
      meta: {
        stack: error?.stack,
        ...(error?.config && {
          config: {
            headers: error.config.headers,
            url: error.config.url,
            data: error.config.data
          }
        }),
        ...(error?.response && {
          response: {
            status: error.response.status,
            statusText: error.response.statusText
          }
        })
      }
    });
  }
};
