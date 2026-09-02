import { describe, expect, it } from 'vitest';
import { runSandboxHttpRequest } from '../../src/utils/sandbox-http';

describe('sandbox HTTP request lifecycle', () => {
  it('任务已结束时不再启动代理请求', async () => {
    const controller = new AbortController();
    const state = { requestCount: 0 };
    controller.abort();

    await expect(
      runSandboxHttpRequest({
        payload: { url: 'https://example.com' },
        limits: {
          maxRequests: 1,
          timeoutMs: 1000,
          maxResponseSize: 1024,
          maxRequestBodySize: 1024
        },
        state,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.requestCount).toBe(0);
  });
});
