import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { Readable } from 'stream';

const baseUrl = process.env.AIPROXY_API_ENDPOINT;
const token = process.env.AIPROXY_API_TOKEN;

// 特殊路径映射，标记需要在末尾保留斜杠的路径
const endPathMap: Record<string, boolean> = {
  'api/dashboardv2': true
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authSystemAdmin({ req });

    if (!baseUrl || !token) {
      throw new Error('AIPROXY_API_ENDPOINT or AIPROXY_API_TOKEN is not set');
    }

    const { path = [], ...query } = req.query as any;

    if (!path.length) {
      throw new Error('url is empty');
    }

    const queryStr = new URLSearchParams(query).toString();
    // Determine whether the base path requires a trailing slash.
    const basePath = `/${path?.join('/')}${endPathMap[path?.join('/')] ? '/' : ''}`;
    const requestPath = queryStr ? `${basePath}?${queryStr}` : basePath;

    const targetUrl = new URL(requestPath, baseUrl);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === 'cookie' || key === 'host' || key === 'origin' || key === 'connection') continue;
      if (value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }
    headers['Authorization'] = `Bearer ${token}`;

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
