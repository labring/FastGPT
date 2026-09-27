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
});
