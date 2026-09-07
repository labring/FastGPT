import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createApiEntry: vi.fn(() => vi.fn()),
  withNextCors: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/service/common/http/entry', () => ({ createApiEntry: mocks.createApiEntry }));
vi.mock('@fastgpt/next/middle/cors', () => ({ withNextCors: mocks.withNextCors }));
await import('@/service/middleware/entry');

describe('NextAPI', () => {
  it('only registers CORS, with no model refresh or request context wrapper', async () => {
    const options = mocks.createApiEntry.mock.calls[0][0] as unknown as {
      beforeCallback: Array<(req: unknown, res: unknown) => Promise<unknown>>;
    };
    expect(options.beforeCallback).toHaveLength(1);
    const req = { method: 'OPTIONS', url: '/api/core/ai/model/list' };
    const res = {};
    await options.beforeCallback[0](req, res);
    expect(mocks.withNextCors).toHaveBeenCalledWith(expect.objectContaining({ req, res }));
  });
});
