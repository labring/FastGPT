import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModelDetailLoader } from '@/web/core/ai/model/modelDetailLoader';
import type { GetModelDetailsBody } from '@fastgpt/global/openapi/core/ai/model/detail';

describe('createModelDetailLoader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const createRequest = () =>
    vi.fn(async ({ modelIds }: GetModelDetailsBody) => ({
      models: modelIds.map((modelId) => ({ modelId, status: 'active' as const, name: modelId }))
    }));
  it('requests different IDs separately and deduplicates the same ID and identity', async () => {
    const request = createRequest();
    const load = createModelDetailLoader(request);
    const args = { identity: 'team/member', modelId: 'a' };
    const first = load(args);
    expect(load(args)).toBe(first);
    await Promise.all([first, load({ ...args, modelId: 'b' })]);
    await load(args);
    expect(request.mock.calls.map(([body]) => body.modelIds)).toEqual([['a'], ['b']]);
    await load({ ...args, identity: 'another-member' });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('refreshes on expiry or explicit force and does not cache failures', async () => {
    vi.useFakeTimers();
    const request = createRequest();
    const load = createModelDetailLoader(request);
    const args = { identity: 'member', modelId: 'a' };
    await load(args);
    await load({ ...args, force: true });
    vi.advanceTimersByTime(30_001);
    await load(args);
    expect(request).toHaveBeenCalledTimes(3);
    request.mockRejectedValueOnce(new Error('network'));
    await expect(load({ ...args, force: true })).rejects.toThrow('network');
    await expect(load(args)).resolves.toMatchObject({ modelId: 'a' });
    expect(request).toHaveBeenCalledTimes(5);
  });
  it('treats an incomplete response as a retryable error, not deleted', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ models: [] })
      .mockResolvedValue({ models: [{ modelId: 'a', status: 'deleted' }] });
    const load = createModelDetailLoader(request);
    await expect(load({ identity: 'member', modelId: 'a' })).rejects.toThrow('Missing model');
    await expect(load({ identity: 'member', modelId: 'a' })).resolves.toEqual({
      modelId: 'a',
      status: 'deleted'
    });
  });
  it('bounds the cache and forwards outlink credentials only to its individual request', async () => {
    const request = createRequest();
    const load = createModelDetailLoader(request);
    for (let index = 0; index < 257; index++)
      await load({ identity: 'member', modelId: String(index) });
    await load({
      identity: 'member',
      modelId: '0',
      outLinkAuthData: { shareId: 's', outLinkUid: 'u' }
    });
    expect(request).toHaveBeenCalledTimes(258);
    expect(request).toHaveBeenLastCalledWith({
      modelIds: ['0'],
      outLinkAuthData: { shareId: 's', outLinkUid: 'u' }
    });
  });
});
