import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { serviceEnv } from '@fastgpt/service/env';
import { timingSafeEqual } from 'crypto';

export const AGENT_SANDBOX_PROXY_HEADER = 'x-proxy-token';

/**
 * 校验 agent-sandbox-proxy 调用主站内部 API 的共享密钥。
 * 这层只服务 proxy 到 Next API 的反向通道，浏览器侧访问仍走 ticket 鉴权。
 */
export function authAgentSandboxProxy(req: ApiRequestProps): string {
  const secret = serviceEnv.AGENT_SANDBOX_PROXY_SECRET;
  if (!secret) {
    throw new Error('AGENT_SANDBOX_PROXY_SECRET environment variable is missing');
  }

  const proxyToken = req.headers[AGENT_SANDBOX_PROXY_HEADER];
  if (typeof proxyToken !== 'string') {
    throw new Error('Unauthorized: Invalid or missing X-Proxy-Token header');
  }

  const expected = Buffer.from(secret);
  const actual = Buffer.from(proxyToken);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Unauthorized: Invalid or missing X-Proxy-Token header');
  }

  return secret;
}
