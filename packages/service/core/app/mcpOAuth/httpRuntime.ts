import { getProxyForUrl } from 'proxy-from-env';
import { assertMCPUrlNotInternal, createMcpSafeFetch } from '../mcp';
import { serviceEnv } from '../../../env';
import { McpOAuthApiError } from './errors';
import {
  McpOAuthErrorCodeEnum,
  type McpOAuthErrorCode
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';

/**
 * MCP OAuth 出站请求（v2.4 §5.1、§11.1）。
 *
 * - 生产路径统一走 `createMcpSafeFetch`：DNS pin、拒绝代理、`redirect:'manual'`。
 * - 测试可注入 fetch；注入时仍然做 URL 安全校验与响应大小限制，
 *   但不做 DNS pin（测试使用不可解析的示例域名）。
 * - 任何请求都禁止跟随重定向；3xx 由调用方按错误处理。
 */

export const MCP_OAUTH_HTTP_TIMEOUT_MS = 10_000;
export const MCP_OAUTH_MAX_RESPONSE_BYTES = 64 * 1024;
export const MCP_OAUTH_URL_MAX_LENGTH = 2048;

export type McpOAuthFetchImpl = (
  url: string | URL,
  init?: RequestInit & { dispatcher?: unknown }
) => Promise<Response>;

export type McpOAuthHttpResponse = {
  status: number;
  headers: Headers;
  body: string;
};

let overrideFetch: McpOAuthFetchImpl | null = null;
let safeFetch: ReturnType<typeof createMcpSafeFetch> | null = null;

/** 仅供测试注入；生产部署不得调用。 */
export const setMcpOAuthFetchImpl = (fetchImpl: McpOAuthFetchImpl | null) => {
  // 生产进程禁止替换 fetch，否则会绕过 DNS pin / 私网校验等出站安全控制。
  // 测试运行器会把 NODE_ENV 设为 production，因此以 VITEST 标识放行。
  if (process.env.NODE_ENV === 'production' && !process.env.VITEST) {
    throw new Error('setMcpOAuthFetchImpl is only available in tests');
  }
  overrideFetch = fetchImpl;
  safeFetch = null;
};

export const resetMcpOAuthFetchImpl = () => setMcpOAuthFetchImpl(null);

/** 开发开关：仅显式设置 `MCP_OAUTH_ALLOW_INSECURE_HTTP=true` 时允许 http。 */
export const isMcpOAuthInsecureHttpAllowed = () => serviceEnv.MCP_OAUTH_ALLOW_INSECURE_HTTP;

const getSafeFetch = () => {
  safeFetch ??= createMcpSafeFetch({ maxRedirects: 0 });
  return safeFetch;
};

/**
 * 校验出站 URL：协议、userinfo/fragment、长度、代理、内网地址。
 * 返回规范化后的字符串，便于调用方去重与比较。
 */
export const assertMcpOAuthUrlSafe = async (
  rawUrl: string,
  { allowInsecureHttp = isMcpOAuthInsecureHttpAllowed() }: { allowInsecureHttp?: boolean } = {}
): Promise<string> => {
  if (!rawUrl || rawUrl.length > MCP_OAUTH_URL_MAX_LENGTH) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.endpointInsecure, {
      message: 'OAuth endpoint URL is invalid or too long'
    });
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.endpointInsecure, {
      message: 'OAuth endpoint URL is invalid'
    });
  }

  if (url.username || url.password || url.hash) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.endpointInsecure, {
      message: 'OAuth endpoint URL must not contain userinfo or fragment'
    });
  }

  if (url.protocol !== 'https:' && !(allowInsecureHttp && url.protocol === 'http:')) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.endpointInsecure, {
      message: 'OAuth endpoint must use https'
    });
  }

  if (getProxyForUrl(url.toString())) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.proxyForbidden, {
      message: 'OAuth requests through an HTTP proxy are not supported'
    });
  }

  try {
    await assertMCPUrlNotInternal(url.toString());
  } catch {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.privateUrl, {
      message: 'OAuth endpoint resolves to a private address'
    });
  }

  return url.toString();
};

const readLimitedBody = async (response: Response): Promise<string> => {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > MCP_OAUTH_MAX_RESPONSE_BYTES) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.responseTooLarge, {
        message: 'OAuth response exceeds 64KB'
      });
    }
  }

  // 流式读取，避免 chunked/无 content-length 的响应在检测大小前被整体缓冲。
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MCP_OAUTH_MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.responseTooLarge, {
        message: 'OAuth response exceeds 64KB'
      });
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * 发送一次 OAuth 出站请求。网络错误、超时统一映射为调用方给定的错误码。
 */
export const requestMcpOAuthHttp = async ({
  url,
  method = 'GET',
  headers,
  body,
  timeoutMs = MCP_OAUTH_HTTP_TIMEOUT_MS,
  allowInsecureHttp,
  networkErrorCode = McpOAuthErrorCodeEnum.discoveryFailed
}: {
  url: string;
  method?: 'GET' | 'POST' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  allowInsecureHttp?: boolean;
  networkErrorCode?: McpOAuthErrorCode;
}): Promise<McpOAuthHttpResponse> => {
  const safeUrl = await assertMcpOAuthUrlSafe(url, { allowInsecureHttp });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchImpl: McpOAuthFetchImpl = (overrideFetch ?? getSafeFetch()) as McpOAuthFetchImpl;
    const response = await fetchImpl(safeUrl, {
      method,
      redirect: 'manual',
      headers,
      body,
      signal: controller.signal
    });

    return {
      status: response.status,
      headers: response.headers,
      body: await readLimitedBody(response)
    };
  } catch (error) {
    if (error instanceof McpOAuthApiError) throw error;
    throw new McpOAuthApiError(networkErrorCode, {
      message: 'OAuth endpoint request failed',
      cause: error
    });
  } finally {
    clearTimeout(timer);
  }
};
