import { createModelSummaryLoader } from '@/web/core/ai/model/modelSummaryLoader';
import type { GetModelSummariesBody } from '@fastgpt/global/openapi/core/ai/model/summary';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('createModelSummaryLoader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const createRequest = () =>
    vi.fn(async ({ modelIds }: GetModelSummariesBody) => ({
      models: modelIds.map((modelId) => ({ modelId, status: 'active' as const, name: modelId }))
    }));
  it('requests different IDs separately and deduplicates the same ID and identity', async () => {
    const request = createRequest();
    const load = createModelSummaryLoader(request);
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
    const load = createModelSummaryLoader(request);
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
    const load = createModelSummaryLoader(request);
    await expect(load({ identity: 'member', modelId: 'a' })).rejects.toThrow('Missing model');
    await expect(load({ identity: 'member', modelId: 'a' })).resolves.toEqual({
      modelId: 'a',
      status: 'deleted'
    });
  });
  it('bounds the cache and forwards outlink credentials only to its individual request', async () => {
    const request = createRequest();
    const load = createModelSummaryLoader(request);
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
  it('primes synchronous display data from catalog without a detail request', async () => {
    vi.useFakeTimers();
    const request = createRequest();
    const load = createModelSummaryLoader(request);
    const key = { identity: 'member', modelId: 'a' };
    const detail = { modelId: 'a', name: 'Catalog A', status: 'active' as const };
    load.prime({ identity: key.identity, detail });
    expect(load.peek(key)).toEqual(detail);
    await expect(load(key)).resolves.toEqual(detail);
    expect(request).not.toHaveBeenCalled();
    expect(load.peek({ ...key, identity: 'other' })).toBeUndefined();
    vi.advanceTimersByTime(30_001);
    expect(load.peek(key)).toBeUndefined();
    await load(key);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])(
    'keeps newer catalog data when an older request completes (failed=%s)',
    async (failed) => {
      let resolve!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      const request = vi.fn(
        () =>
          new Promise<any>((ok, fail) => {
            resolve = ok;
            reject = fail;
          })
      );
      const load = createModelSummaryLoader(request);
      const key = { identity: 'member', modelId: 'a' };
      const pending = load(key);
      load.invalidate(key);
      expect(load(key)).toBe(pending);
      const detail = { modelId: 'a', name: 'New A', status: 'active' as const };
      load.prime({ identity: key.identity, detail });
      if (failed) reject(new Error('old network failure'));
      else resolve({ models: [{ modelId: 'a', status: 'deleted' }] });
      await expect(pending).resolves.toEqual(detail);
      expect(load.peek(key)).toEqual(detail);
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
  it('invalidates only the requested completed entry', async () => {
    const request = createRequest();
    const load = createModelSummaryLoader(request);
    await load({ identity: 'member', modelId: 'a' });
    await load({ identity: 'member', modelId: 'b' });
    load.invalidate({ identity: 'member', modelId: 'a' });
    await load({ identity: 'member', modelId: 'b' });
    expect(request).toHaveBeenCalledTimes(2);
    await load({ identity: 'member', modelId: 'a' });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
