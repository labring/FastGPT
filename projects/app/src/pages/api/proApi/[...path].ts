import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import { buildSameOriginUrl } from '@fastgpt/service/common/security/network';
import { Readable } from 'stream';
import { finished, pipeline } from 'node:stream/promises';
import { FASTGPT_PRO_TOKEN_HEADER } from '@fastgpt/global/common/system/constants';
import {
  isRootMemberForbiddenError,
  normalizeProApiSubPath,
  prepareProApiRootGuard
} from '@/service/support/user/team/proApiRootGuard';

/** 原样转发 Pro API 的请求和响应流；等待回包结束，避免 NextAPI 抢先生成默认 JSON。 */
async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { path = [], ...query } = req.query as any;
    const subPath = normalizeProApiSubPath(path);
    const requestPath = `/api/${path?.join('/')}?${new URLSearchParams(query).toString()}`;

    if (!requestPath) {
      throw new Error('url is empty');
    }

    // 在代理转发前校验租户成员对系统 root 成员的越权写操作（即使未启动商业版服务也优先生效拦截）。
    const guardPlan = await prepareProApiRootGuard({ req, subPath });

    if (!FastGPTProUrl) {
      throw new Error(`未配置商业版链接: ${path}`);
    }

    // 防御 protocol-relative URL 覆盖主机(如 path 含空段 → `//169.254...`)
    const targetUrl = buildSameOriginUrl(requestPath, FastGPTProUrl);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        key === 'rootkey' ||
        key === FASTGPT_PRO_TOKEN_HEADER ||
        key === 'host' ||
        key === 'connection'
      ) {
        continue;
      }
      if (value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    const requestBody = (() => {
      if (req.method === 'GET' || req.method === 'HEAD') return null;
      if (guardPlan.kind === 'guarded' && guardPlan.rawBody !== undefined) {
        return guardPlan.rawBody.length > 0 ? new Uint8Array(guardPlan.rawBody) : null;
      }
      return req as any;
    })();

    const request = new Request(targetUrl, {
      // @ts-ignore
      ...(requestBody && !(requestBody instanceof Uint8Array) ? { duplex: 'half' } : {}),
      method: req.method,
      headers,
      body: requestBody
    });

    const response = await fetch(request);

    if (
      guardPlan.kind === 'guarded' &&
      guardPlan.transformJsonResponse &&
      response.ok &&
      (response.headers.get('content-type') || '').includes('application/json')
    ) {
      const responseText = await response.text();
      const filteredBody = guardPlan.transformJsonResponse(responseText);

      response.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey === 'content-encoding' ||
          lowerKey === 'transfer-encoding' ||
          lowerKey === 'content-length'
        ) {
          return;
        }
        res.setHeader(key, value);
      });
      res.setHeader('Content-Length', Buffer.byteLength(filteredBody, 'utf8'));
      res.status(response.status);
      res.end(filteredBody);
      await finished(res, { cleanup: true });
      return;
    }

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
    // pipeline 失败可能已发送部分上游响应或销毁连接，交由入口记录错误，不能追加 JSON。
    if (res.headersSent || res.writableEnded || res.destroyed) {
      throw error;
    }

    jsonRes(res, {
      code: isRootMemberForbiddenError(error) ? 403 : 500,
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
