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
  normalizeMcpOAuthBasePath
} from '@fastgpt/service/core/app/mcpOAuth';

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
});
