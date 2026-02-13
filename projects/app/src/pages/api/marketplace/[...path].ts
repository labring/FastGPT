import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { Readable } from 'stream';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authSystemAdmin({ req });
    const { path = [], ...query } = req.query as any;

    const queryStr = new URLSearchParams(query).toString();
    const requestPath = queryStr
      ? `/${path?.join('/')}?${new URLSearchParams(query).toString()}`
      : `/${path?.join('/')}`;

    if (!requestPath) {
      throw new Error('url is empty');
    }

    const marketplaceUrl = process.env.MARKETPLACE_URL || 'https://marketplace.fastgpt.cn';

    if (!marketplaceUrl) {
      throw new Error('MARKETPLACE_URL is not configured');
    }

    const targetUrl = new URL(requestPath, marketplaceUrl);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === 'cookie' || key === 'host' || key === 'origin' || key === 'connection') continue;
      if (value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    const request = new Request(targetUrl, {
      // @ts-ignore
      duplex: 'half',
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? null : (req as any)
    });

    const response = await fetch(request);

    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'content-encoding' || lowerKey === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    res.status(response.status);

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
