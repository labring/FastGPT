import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callbackIp: vi.fn(),
  clientMetadataIp: vi.fn()
}));

vi.mock('@fastgpt/service/common/rateLimit/interface/mcpOAuth', () => ({
  assertMcpOAuthStartByAppRateLimit: vi.fn(),
  assertMcpOAuthStartByUserRateLimit: vi.fn(),
  assertMcpOAuthCallbackByIpRateLimit: mocks.callbackIp,
  assertMcpOAuthCallbackByAppRateLimit: vi.fn(),
  assertMcpOAuthDisconnectByAppRateLimit: vi.fn(),
  assertMcpOAuthClientResetByAppRateLimit: vi.fn(),
  assertMcpOAuthClientMetadataByIpRateLimit: mocks.clientMetadataIp
}));

import {
  assertMcpOAuthRateLimit,
  normalizeMcpOAuthBasePath,
  trySendMcpOAuthRuntimeError
} from '@fastgpt/service/core/app/mcpOAuth';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { PRIVATE_URL_TEXT } from '@fastgpt/global/common/system/network';

const createRes = () => {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: any;
  let ended = false;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      headers[key.toLowerCase()] = value;
      return res;
    },
    json(value: unknown) {
      body = value;
      ended = true;
      return value;
    },
    end() {
      ended = true;
      return res;
    },
    get writableEnded() {
      return ended;
    },
    get headersSent() {
      return ended;
    }
  };
  return {
    res,
    headers,
    get status() {
      return statusCode;
    },
    get body() {
      return body;
    }
  };
};

describe('mcpOAuth apiSupport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes base paths, including absolute NEXT_PUBLIC_BASE_URL values', () => {
    expect(normalizeMcpOAuthBasePath(undefined)).toBe('');
    expect(normalizeMcpOAuthBasePath('base/')).toBe('/base');
    expect(normalizeMcpOAuthBasePath('/base/')).toBe('/base');
    expect(normalizeMcpOAuthBasePath('https://fastgpt.example.com/base/')).toBe('/base');
    // 只有 origin 的绝对 URL 不能拼出 `/https:/...` 或空路径段。
    expect(normalizeMcpOAuthBasePath('https://fastgpt.example.com')).toBe('');
    expect(normalizeMcpOAuthBasePath('https://fastgpt.example.com/')).toBe('');
    // 非法绝对 URL 不能抛异常扩散成所有 OAuth 路由的 500，按“无 base path”降级。
    expect(() => normalizeMcpOAuthBasePath('https://')).not.toThrow();
    expect(normalizeMcpOAuthBasePath('https://')).toBe('');
    expect(() => normalizeMcpOAuthBasePath('http://[')).not.toThrow();
    expect(normalizeMcpOAuthBasePath('http://[')).toBe('');
    expect(normalizeMcpOAuthBasePath('http://a b/')).toBe('');
  });

  it('skips IP rate limits when the client IP cannot be resolved', async () => {
    // 空 IP 不能落进同一个全局桶，否则会误伤所有合法回调/文档请求。
    await expect(
      assertMcpOAuthRateLimit('callback-ip', { ip: undefined })
    ).resolves.toBeUndefined();
    await expect(
      assertMcpOAuthRateLimit('client-metadata-ip', { ip: undefined })
    ).resolves.toBeUndefined();
    expect(mocks.callbackIp).not.toHaveBeenCalled();
    expect(mocks.clientMetadataIp).not.toHaveBeenCalled();

    await assertMcpOAuthRateLimit('callback-ip', { ip: '203.0.113.7' });
    await assertMcpOAuthRateLimit('client-metadata-ip', { ip: '203.0.113.7' });
    expect(mocks.callbackIp).toHaveBeenCalledWith({ ip: '203.0.113.7' });
    expect(mocks.clientMetadataIp).toHaveBeenCalledWith({ ip: '203.0.113.7' });
  });

  it('hashes non-empty IPs and rejects an empty IP outright', async () => {
    const actual = await vi.importActual<
      typeof import('@fastgpt/service/common/rateLimit/interface/mcpOAuth')
    >('@fastgpt/service/common/rateLimit/interface/mcpOAuth');

    expect(actual.getMcpOAuthIpRateLimitSegment('203.0.113.7')).toMatch(/^[a-f0-9]{64}$/);
    expect(() => actual.getMcpOAuthIpRateLimitSegment('')).toThrow(/non-empty client IP/);
  });

  describe('trySendMcpOAuthRuntimeError', () => {
    const req = { headers: { 'x-request-id': 'req-123' } };

    it('writes the fixed oauth envelope for McpOAuthApiError', () => {
      const target = createRes();
      const sent = trySendMcpOAuthRuntimeError({
        req,
        res: target.res,
        error: new McpOAuthApiError(McpOAuthErrorCodeEnum.reauthRequired, {
          message: 'remote error_description="secret detail"'
        })
      });

      expect(sent).toBe(true);
      expect(target.status).toBe(401);
      expect(target.body).toMatchObject({
        code: 401,
        statusText: 'error',
        data: {
          oauthCode: McpOAuthErrorCodeEnum.reauthRequired,
          requestId: 'req-123',
          retryable: false
        }
      });
      expect(target.headers['cache-control']).toBe('no-store');
    });

    it('maps the private-url precheck text to mcp_oauth_private_url', () => {
      const target = createRes();
      expect(trySendMcpOAuthRuntimeError({ req, res: target.res, error: PRIVATE_URL_TEXT })).toBe(
        true
      );
      expect(target.status).toBe(400);
      expect(target.body.data.oauthCode).toBe(McpOAuthErrorCodeEnum.privateUrl);
    });

    it('returns false for unrelated errors so the generic 500 pipeline keeps working', () => {
      const target = createRes();
      const error = new Error('database offline');
      expect(trySendMcpOAuthRuntimeError({ req, res: target.res, error })).toBe(false);
      expect(target.body).toBeUndefined();
    });
  });
});
