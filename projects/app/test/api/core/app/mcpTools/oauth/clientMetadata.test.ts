import { describe, expect, it, vi } from 'vitest';
import { callRoute } from './helpers';

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/core/app/mcpOAuth', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/app/mcpOAuth')>();
  return { ...actual, assertMcpOAuthEnabled: () => {} };
});

vi.mock('@fastgpt/service/common/rateLimit/interface/mcpOAuth', () => ({
  assertMcpOAuthStartByAppRateLimit: vi.fn(async () => {}),
  assertMcpOAuthStartByUserRateLimit: vi.fn(async () => {}),
  assertMcpOAuthCallbackByAppRateLimit: vi.fn(async () => {}),
  assertMcpOAuthCallbackByIpRateLimit: vi.fn(async () => {}),
  assertMcpOAuthDisconnectByAppRateLimit: vi.fn(async () => {}),
  assertMcpOAuthClientResetByAppRateLimit: vi.fn(async () => {}),
  assertMcpOAuthClientMetadataByIpRateLimit: vi.fn(async () => {}),
  getMcpOAuthIpRateLimitSegment: (ip: string) => `seg-${ip}`
}));

import * as metadataApi from '@/pages/api/core/app/mcpTools/oauth/client-metadata.json';

const HOST = 'fastgpt.example.com';

describe('GET /api/core/app/mcpTools/oauth/client-metadata.json', () => {
  it('serves the CIMD document with ETag and revalidation cache headers', async () => {
    const res = await callRoute(metadataApi.default, {
      method: 'GET',
      headers: { host: HOST }
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      client_name: 'FastGPT',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      code_challenge_method: 'S256'
    });
    expect(res.body.redirect_uris).toEqual([
      'https://fastgpt.example.com/api/core/app/mcpTools/oauth/callback'
    ]);
    expect(res.body.client_id).toBe(
      'https://fastgpt.example.com/api/core/app/mcpTools/oauth/client-metadata.json'
    );
    expect(res.headers.etag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(res.headers['cache-control']).toBe('public, max-age=300, must-revalidate');
  });

  it('returns 304 when If-None-Match matches the ETag', async () => {
    const first = await callRoute(metadataApi.default, {
      method: 'GET',
      headers: { host: HOST }
    });
    const second = await callRoute(metadataApi.default, {
      method: 'GET',
      headers: { host: HOST, 'if-none-match': first.headers.etag }
    });
    expect(second.status).toBe(304);
    expect(second.body).toBeUndefined();
  });

  it('returns 404 for any Host other than FE_DOMAIN', async () => {
    const res = await callRoute(metadataApi.default, {
      method: 'GET',
      headers: { host: 'evil.example.com' }
    });
    expect(res.status).toBe(404);
  });

  it('supports HEAD without a body', async () => {
    const res = await callRoute(metadataApi.default, {
      method: 'HEAD',
      headers: { host: HOST }
    });
    expect(res.status).toBe(200);
    expect(res.body).toBeUndefined();
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('rejects other methods with 405 and an Allow header', async () => {
    const res = await callRoute(metadataApi.default, {
      method: 'POST',
      headers: { host: HOST }
    });
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, HEAD');
  });
});
