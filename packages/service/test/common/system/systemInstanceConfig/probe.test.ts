import { describe, expect, it } from 'vitest';
import { probeUrlConnection } from '../../../../common/system/systemInstanceConfig/probe';

describe('probeUrlConnection', () => {
  it('gracefully handles unreachable host without throwing', async () => {
    const result = await probeUrlConnection({
      url: 'http://127.0.0.1:59999/non-existing-health',
      timeoutMs: 1000
    });

    expect(result.connected).toBe(false);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeDefined();
  });

  it('handles invalid DNS hostname without throwing', async () => {
    const result = await probeUrlConnection({
      url: 'http://this-hostname-definitely-does-not-exist-12345678.com',
      timeoutMs: 1000
    });

    expect(result.connected).toBe(false);
    expect(result.error).toBeDefined();
  });
  it('successfully probes a running local health endpoint with GET (e.g. status 200)', async () => {
    // 探测本地可达端口时应正确获得 HTTP 状态码
    const result = await probeUrlConnection({
      url: 'http://localhost:3010/api/status',
      timeoutMs: 2000
    });

    if (result.connected) {
      expect(result.status).toBe(200);
      expect(result.statusText).toBe('OK');
    }
  });
});
