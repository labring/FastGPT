import type { NextApiRequest, NextApiResponse } from 'next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { Readable } from 'stream';
import { getErrText } from '@fastgpt/global/common/error/utils';

const baseUrl = process.env.AIPROXY_API_ENDPOINT;
const token = process.env.AIPROXY_API_TOKEN;

// 特殊路径映射，标记需要在末尾保留斜杠的路径
const endPathMap: Record<string, boolean> = {
  'api/dashboardv2': true
};

const normalizeEndpoint = (endpoint: string) => endpoint.trim().replace(/\/+$/, '');

const formatAiproxyError = (error: unknown, endpoint?: string) => {
  const errorText = getErrText(error);
  const detail = endpoint ? ` (AIPROXY_API_ENDPOINT=${endpoint})` : '';
  const tips: string[] = [];

  if (endpoint) {
    try {
      const url = new URL(endpoint);
      const hostname = url.hostname.toLowerCase();
      const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);

      if (isLocalHost && url.protocol === 'https:') {
        tips.push(
          'If AI Proxy is local and not behind TLS, use http:// instead of https:// for AIPROXY_API_ENDPOINT.'
        );
      }
      if (isLocalHost) {
        tips.push(
          'If FastGPT runs in Docker, localhost points to the FastGPT container itself. Use a container service name or a reachable host IP.'
        );
      }
    } catch {}
  }

  return `AI Proxy request failed${detail}: ${errorText}${tips.length > 0 ? ` ${tips.join(' ')}` : ''}`;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authSystemAdmin({ req });

    if (!baseUrl || !token) {
      const errorMsg = 'AI Proxy service is not configured. Please set AIPROXY_API_ENDPOINT and AIPROXY_API_TOKEN environment variables to use channel management features. Alternatively, you can configure models with custom request URLs in the model configuration section.';
      throw new Error(errorMsg);
    }

    const { path = [], ...query } = req.query as any;

    if (!path.length) {
      throw new Error('url is empty');
    }

    const queryStr = new URLSearchParams(query).toString();
    // Determine whether the base path requires a trailing slash.
    const basePath = `/${path?.join('/')}${endPathMap[path?.join('/')] ? '/' : ''}`;
    const requestPath = queryStr ? `${basePath}?${queryStr}` : basePath;
    const targetUrl = new URL(requestPath, `${normalizeEndpoint(baseUrl)}/`);

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
    res.status(500).json({
      success: false,
      message: formatAiproxyError(error, baseUrl),
      data: null
    });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
