import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
import {
  readSystemConfigScopeVersions,
  startSystemConfigPolling
} from '../../../../common/system/systemInstanceConfig/polling';

describe('readSystemConfigScopeVersions', () => {
  it('reads only primary version metadata and includes document identity', async () => {
    const doc = await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 3,
      overrides: { name: 'Config' }
    });
    const find = vi.spyOn(MongoSystemInstanceConfig.collection, 'find');
    try {
      expect(await readSystemConfigScopeVersions()).toEqual({ site: `${doc._id}:3` });
      const options = find.mock.calls[0][1];
      expect(options?.projection).toEqual({ _id: 1, domain: 1, revision: 1 });
      const preference = options?.readPreference;
      expect(typeof preference === 'string' ? preference : preference?.mode).toBe('primary');
    } finally {
      find.mockRestore();
    }
  });
});

describe('startSystemConfigPolling', () => {
  const read = vi.fn();
  const refresh = vi.fn();
  let stop: (() => Promise<void>) | undefined;
  let stopPro: (() => Promise<void>) | undefined;
  const row = (domain: string, revision: number, _id = domain) => ({ domain, revision, _id });

  beforeEach(() => {
    vi.useFakeTimers();
    read.mockReset().mockResolvedValue([row('site', 1)]);
    refresh.mockReset().mockResolvedValue(undefined);
    vi.spyOn(MongoSystemInstanceConfig, 'find').mockImplementation(
      () => ({ read: () => ({ lean: read }) }) as any
    );
  });
  afterEach(async () => {
    await stop?.();
    await stopPro?.();
    stop = undefined;
    stopPro = undefined;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loads initially, then polls once per second without reloading unchanged scopes', async () => {
    stop = startSystemConfigPolling({ key: 'app', refresh });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledWith({ changedScopes: ['site'], initialLoad: true });
    await vi.advanceTimersByTimeAsync(999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    read.mockResolvedValue([row('site', 2), row('proEnv', 1)]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenLastCalledWith({
      changedScopes: ['site', 'proEnv'],
      initialLoad: false
    });
    await stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('detects deletion and recreation with the same revision', async () => {
    stop = startSystemConfigPolling({ key: 'app', refresh });
    await vi.advanceTimersByTimeAsync(0);
    read.mockResolvedValue([row('site', 1, 'replacement')]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    read.mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenLastCalledWith({ changedScopes: ['site'], initialLoad: false });
  });

  it('retries failed reads and refreshes without confirming the failed version', async () => {
    read.mockRejectedValueOnce(new Error('read failed'));
    refresh.mockRejectedValueOnce(new Error('refresh failed'));
    stop = startSystemConfigPolling({ key: 'app', refresh });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('waits one second after a slow refresh and catches writes made during that refresh', async () => {
    let finish: () => void = () => {};
    refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    stop = startSystemConfigPolling({ key: 'app', refresh });
    await vi.advanceTimersByTimeAsync(0);
    read.mockResolvedValue([row('site', 2)]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenLastCalledWith({ changedScopes: ['site'], initialLoad: false });
  });

  it('keeps waiting for readiness even if no further database writes occur', async () => {
    const ready = vi.fn().mockResolvedValue(false);
    stop = startSystemConfigPolling({ key: 'pro', refresh, isReady: ready });
    await vi.advanceTimersByTimeAsync(2000);
    expect(read).not.toHaveBeenCalled();
    ready.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('deduplicates registration per role and allows a stopped role to register again', async () => {
    stop = startSystemConfigPolling({ key: 'app', refresh });
    const unused = vi.fn();
    expect(startSystemConfigPolling({ key: 'app', refresh: unused })).toBe(stop);
    stopPro = startSystemConfigPolling({ key: 'pro', refresh: unused });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledOnce();
    expect(unused).toHaveBeenCalledOnce();
    await stop();
    stop = startSystemConfigPolling({ key: 'app', refresh });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not publish a query that completes after stopping', async () => {
    let finish: (value: unknown[]) => void = () => {};
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    stop = startSystemConfigPolling({ key: 'app', refresh });
    const stopped = stop();
    finish([row('site', 1)]);
    await stopped;
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not start a database read if stopped while waiting for readiness', async () => {
    let finish: (ready: boolean) => void = () => {};
    const ready = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    stop = startSystemConfigPolling({ key: 'pro', refresh, isReady: () => ready });
    const stopped = stop();
    finish(true);
    await stopped;
    expect(read).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
