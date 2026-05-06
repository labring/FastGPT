import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { buildSameOriginUrl } from '@fastgpt/service/common/security/network';
import { Readable } from 'stream';
import { getAIProxyAdminConfig } from '@fastgpt/service/thirdProvider/aiproxy/config';

// 特殊路径映射，标记需要在末尾保留斜杠的路径
const endPathMap: Record<string, boolean> = {
  'api/dashboardv2': true
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authSystemAdmin({ req });
    const { baseUrl, token } = getAIProxyAdminConfig();

    const { path = [], ...query } = req.query as any;

    if (!path.length) {
      throw new Error('url is empty');
    }

    const queryStr = new URLSearchParams(query).toString();
    // Determine whether the base path requires a trailing slash.
    const basePath = `/${path?.join('/')}${endPathMap[path?.join('/')] ? '/' : ''}`;
    const requestPath = queryStr ? `${basePath}?${queryStr}` : basePath;

    // 防御 protocol-relative URL 覆盖主机(如 path 含空段 → `//169.254...`)
    const targetUrl = buildSameOriginUrl(requestPath, baseUrl);

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
