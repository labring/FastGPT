import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the aiproxy relay scope injection helper (design §2.9):
 * `getAiproxyScopeHeaders` — system models → global scope, private models → own
 * scope + owner group, everything else → no injection.
 *
 * The config module reads `AIPROXY_API_ENDPOINT` at import time, so each case
 * stubs the env var and re-imports the module (same pattern as config.test.ts).
 */

const originalEnv = {
  AIPROXY_API_ENDPOINT: process.env.AIPROXY_API_ENDPOINT
};

const importConfig = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/config');
};

const aiproxyBaseUrl = 'http://aiproxy:3000/v1';

describe('getAiproxyScopeHeaders', () => {
  afterEach(() => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', originalEnv.AIPROXY_API_ENDPOINT);
  });

  it('injects global scope for system models on the aiproxy relay', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
    const { getAiproxyScopeHeaders } = await importConfig();

    expect(getAiproxyScopeHeaders({ isSystem: true }, aiproxyBaseUrl)).toEqual({
      'X-Aiproxy-Group-Channel-Mode': 'global'
    });
  });

  it('injects own scope + owner group for private models on the aiproxy relay', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
    const { getAiproxyScopeHeaders } = await importConfig();

    expect(getAiproxyScopeHeaders({ tmbId: 'tmb123' }, aiproxyBaseUrl)).toEqual({
      'X-Aiproxy-Group': 'fastgpt:tmb:tmb123',
      'X-Aiproxy-Group-Channel-Mode': 'own'
    });
  });

  it('never injects when the request does not go to the aiproxy relay', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
    const { getAiproxyScopeHeaders } = await importConfig();

    // user key / oneapi / OPENAI_BASE_URL baseUrls are not the relay
    expect(getAiproxyScopeHeaders({ isSystem: true }, 'https://api.openai.com/v1')).toEqual({});
    expect(getAiproxyScopeHeaders({ tmbId: 'tmb123' }, 'https://oneapi.example.com/v1')).toEqual(
      {}
    );
    expect(getAiproxyScopeHeaders({ isSystem: true }, undefined)).toEqual({});
  });

  it('injects nothing when the aiproxy relay is not configured at all', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', '');
    const { getAiproxyScopeHeaders } = await importConfig();

    expect(getAiproxyScopeHeaders({ isSystem: true }, undefined)).toEqual({});
    expect(getAiproxyScopeHeaders({ tmbId: 'tmb123' }, aiproxyBaseUrl)).toEqual({});
  });

  it('returns nothing for models without ownership info', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
    const { getAiproxyScopeHeaders } = await importConfig();

    expect(getAiproxyScopeHeaders(undefined, aiproxyBaseUrl)).toEqual({});
    expect(getAiproxyScopeHeaders({}, aiproxyBaseUrl)).toEqual({});
  });

  it('treats isSystem as authoritative even if a tmbId is present', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
    const { getAiproxyScopeHeaders } = await importConfig();

    expect(getAiproxyScopeHeaders({ isSystem: true, tmbId: 'tmb123' }, aiproxyBaseUrl)).toEqual({
      'X-Aiproxy-Group-Channel-Mode': 'global'
    });
  });
});
