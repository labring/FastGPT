import type { NextApiRequest, NextApiResponse } from 'next';
import { Readable } from 'stream';
import { jsonRes } from '@fastgpt/service/common/response';
import { AssistedGenerationUrl } from '@fastgpt/service/common/system/constants';
import { buildSameOriginUrl } from '@fastgpt/service/common/security/network';

const buildRequestPath = (req: NextApiRequest): string => {
  const { path: pathPart, ...query } = req.query;
  const pathSegments = Array.isArray(pathPart) ? pathPart : pathPart ? [pathPart] : [];

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) searchParams.append(key, item);
    } else if (value !== undefined) {
      searchParams.append(key, value);
    }
  }
  const queryString = searchParams.toString();

  return `/api/${pathSegments.join('/')}${queryString ? `?${queryString}` : ''}`;
};

/**
 * 辅助生成服务（assisted-generation-service）同源反代。
 *
 * 与 /api/proApi/[...path] 同构：客户端 cookie/headers 原样透传给独立 Hono 服务，
 * SSE 响应以流方式回传。服务内部完成鉴权与生成。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const requestPath = buildRequestPath(req);

    if (!requestPath) {
      throw new Error('url is empty');
    }
    if (!AssistedGenerationUrl) {
      throw new Error('未配置辅助生成服务链接: ASSISTED_GENERATION_URL');
    }

    // 防御 protocol-relative URL 覆盖主机(如 path 含空段 → `//169.254...`)
    const targetUrl = buildSameOriginUrl(requestPath, AssistedGenerationUrl);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        key === 'rootkey' ||
        key === 'fastgpt-pro-token' ||
        key === 'host' ||
        key === 'connection'
      ) {
        continue;
      }
      if (value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    // Node stream/web 与 undici BodyInit 的 ReadableStream 类型不同源；运行时同为 web stream 实现。
    const body =
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : (Readable.toWeb(req) as unknown as BodyInit);
    const request = new Request(targetUrl, {
      method: req.method,
      headers,
      ...(body ? { body, duplex: 'half' } : {})
    });

    const response = await fetch(request);

    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'content-encoding' || lowerKey === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    res.status(response.status);

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as unknown as import('stream/web').ReadableStream
      );
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
