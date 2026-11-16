import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionedDataCache } from '@fastgpt/service/common/cache/versionedDataCache';

/** 可控的数据源和共享版本，用两个实例模拟不同服务进程。 */
const createFixture = () => {
  let version = 1;
  const store = {
    getOrInitialize: vi.fn(async () => String(version)),
    refresh: vi.fn(async () => {
      version += 1;
    })
  };
  class DataCache extends VersionedDataCache<string[]> {
    load = vi.fn(async () => ['initial']);
    constructor() {
      super({ key: 'appTemplates', maxAgeMs: 1000, versionStore: store });
    }
  }
  return { store, first: new DataCache(), second: new DataCache() };
};

/** 延迟数据源用于构造真实的异步交错，无需依赖定时等待。 */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

afterEach(() => vi.useRealTimers());

describe('VersionedDataCache.get', () => {
  it('复用空数据，版本变化后跨实例加载，TTL 补偿未通知的数据源变化', async () => {
    vi.useFakeTimers();
    const { first, second } = createFixture();
    first.load.mockResolvedValue([]);
    expect(await first.get()).toEqual([]);
    expect(await first.get()).toEqual([]);
    expect(first.load).toHaveBeenCalledOnce();
    await second.get();
    first.load.mockResolvedValue(['updated']);
    second.load.mockResolvedValue(['updated']);
    await first.refreshVersion();
    expect(await first.get()).toEqual(['updated']);
    expect(await second.get()).toEqual(['updated']);
    second.load.mockResolvedValue(['plugin-update']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await second.get()).toEqual(['plugin-update']);
  });

  it('同版本并发只加载一次，加载期间变化的版本不附到旧结果上', async () => {
    const { first, store } = createFixture();
    const pending = deferred<string[]>();
    first.load.mockReturnValueOnce(pending.promise).mockResolvedValue(['new']);
    const oldReads = [first.get(), first.get()];
    await vi.waitFor(() => expect(first.load).toHaveBeenCalledOnce());
    await store.refresh();
    const newRead = first.get();
    pending.resolve(['old']);
    expect(await Promise.all(oldReads)).toEqual([['old'], ['old']]);
    expect(await newRead).toEqual(['new']);
    expect(await first.get()).toEqual(['new']);
    expect(first.load).toHaveBeenCalledTimes(2);
  });

  it('本地写入期间未结束的旧加载不会重新发布为有效缓存', async () => {
    const { first } = createFixture();
    const pending = deferred<string[]>();
    first.load.mockReturnValueOnce(pending.promise).mockResolvedValue(['committed']);
    const oldRead = first.get();
    await vi.waitFor(() => expect(first.load).toHaveBeenCalledOnce());
    await first.refreshVersion();
    const newRead = first.get();
    pending.resolve(['before-commit']);
    await oldRead;
    expect(await newRead).toEqual(['committed']);
    expect(await first.get()).toEqual(['committed']);
    expect(first.load).toHaveBeenCalledTimes(2);
  });

  it('数据源失败保留旧快照但不确认新版本，下次读取继续重试', async () => {
    const { first, second } = createFixture();
    await first.get();
    await first.refreshVersion();
    first.load.mockRejectedValueOnce(new Error('source unavailable'));
    expect(await first.get()).toEqual(['initial']);
    first.load.mockResolvedValue(['recovered']);
    expect(await first.get()).toEqual(['recovered']);
    second.load.mockRejectedValue(new Error('initial failure'));
    await expect(second.get()).rejects.toThrow('initial failure');
  });

  it('Redis 故障时按 TTL 刷新，恢复后重新校验版本', async () => {
    vi.useFakeTimers();
    const { first, store } = createFixture();
    await first.get();
    store.getOrInitialize.mockRejectedValue(new Error('redis down'));
    first.load.mockResolvedValue(['fallback']);
    expect(await first.get()).toEqual(['initial']);
    expect(first.load).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await first.get()).toEqual(['fallback']);
    store.getOrInitialize.mockResolvedValue('1');
    first.load.mockResolvedValue(['verified']);
    expect(await first.get()).toEqual(['verified']);
  });

  it('Redis 首次不可用仍可加载，且空数据也是有效快照', async () => {
    const { first, store } = createFixture();
    store.getOrInitialize.mockRejectedValue(new Error('redis down'));
    first.load.mockResolvedValue([]);
    expect(await first.get()).toEqual([]);
    expect(await first.get()).toEqual([]);
    expect(first.load).toHaveBeenCalledOnce();
  });
});

describe('VersionedDataCache.refresh', () => {
  it('只重载本地数据，不改共享版本', async () => {
    const { first, store } = createFixture();
    await first.get();
    first.load.mockResolvedValue(['forced']);
    expect(await first.refresh()).toEqual(['forced']);
    expect(store.refresh).not.toHaveBeenCalled();
  });
});

describe('VersionedDataCache.refreshVersion', () => {
  it('通知失败仍失效本地缓存，后续读取重试通知并使其他实例刷新', async () => {
    const { first, second, store } = createFixture();
    await first.get();
    await second.get();
    first.load.mockResolvedValue(['committed']);
    second.load.mockResolvedValue(['committed']);
    store.refresh.mockRejectedValueOnce(new Error('redis down'));
    await expect(first.refreshVersion()).rejects.toThrow('redis down');
    expect(await first.get()).toEqual(['committed']);
    expect(await second.get()).toEqual(['committed']);
    expect(store.refresh).toHaveBeenCalledTimes(2);
  });

  it('并发提交不合并版本通知，旧通知结束后不会吞掉新写入', async () => {
    const { first, store } = createFixture();
    const pending = deferred<void>();
    store.refresh
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new Error('second failed'));
    const oldNotify = first.refreshVersion();
    await expect(first.refreshVersion()).rejects.toThrow('second failed');
    pending.resolve();
    await oldNotify;
    await first.get();
    expect(store.refresh).toHaveBeenCalledTimes(3);
  });
});
