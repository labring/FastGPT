import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { Readable } from 'stream';
import { finished, pipeline } from 'node:stream/promises';
import { authSystemAdmin, authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { buildSameOriginUrl } from '@fastgpt/service/common/security/network';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';

/** 转发市场响应并等待流结束，避免统一入口抢先写入默认 JSON 或覆盖上游状态码。 */
async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { path = [], ...query } = req.query as any;
    const pathSegments = Array.isArray(path) ? path : [path];

    if (pathSegments[0] === 'api' && pathSegments[1] === 'admin') {
      await authSystemAdmin({ req });
    } else {
      await authUserPer({ req, authToken: true });
    }

    const queryStr = new URLSearchParams(query).toString();
    const requestPath = queryStr
      ? `/${path?.join('/')}?${new URLSearchParams(query).toString()}`
      : `/${path?.join('/')}`;

    if (!requestPath) {
      throw new Error('url is empty');
    }

    const marketplaceUrl = getSystemInstanceConfig().site.marketplaceUrl;

    if (!marketplaceUrl) {
      throw new Error('Marketplace URL is not configured');
    }

    // 防御 protocol-relative URL 覆盖主机(如 path 含空段 → `//169.254...`)
    const targetUrl = buildSameOriginUrl(requestPath, marketplaceUrl);

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
      await pipeline(nodeStream, res);
    } else {
      res.end();
      await finished(res, { cleanup: true });
    }
  } catch (error) {
    // 流失败可能已经发送响应或销毁连接，交由统一入口收尾，不能再追加 JSON。
    if (res.headersSent || res.writableEnded || res.destroyed) {
      throw error;
    }

    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
