import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedData, getVersionKey, refreshVersionKey } from '@fastgpt/service/common/cache';
import { initCache } from '@fastgpt/service/common/cache/init';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { serviceEnv } from '@fastgpt/service/env';

const { mockSystemVersionCache } = vi.hoisted(() => ({
  mockSystemVersionCache: {
    getOrInitialize: vi.fn(),
    refresh: vi.fn()
  }
}));

vi.mock('@fastgpt/dal/redis/caches', () => ({
  systemVersionCache: mockSystemVersionCache
}));

const originalDisableCache = serviceEnv.DISABLE_CACHE;

beforeEach(() => {
  delete (global as any).systemCache;
  vi.clearAllMocks();
  mockSystemVersionCache.getOrInitialize.mockResolvedValue('version-1');
  mockSystemVersionCache.refresh.mockResolvedValue(undefined);
});

describe('refreshVersionKey', () => {
  it.each([
    [undefined, { key: SystemCacheKeyEnum.modelPermission, id: undefined }],
    ['team123', { key: SystemCacheKeyEnum.modelPermission, id: 'team123' }],
    ['*', { key: SystemCacheKeyEnum.modelPermission, id: '*' }]
  ] as const)('delegates id %s to the System Version Cache', async (id, expected) => {
    await refreshVersionKey(SystemCacheKeyEnum.modelPermission, id);

    expect(mockSystemVersionCache.refresh).toHaveBeenCalledWith(expected);
  });

  it('initializes systemCache before refreshing', async () => {
    expect((global as any).systemCache).toBeUndefined();

    await refreshVersionKey(SystemCacheKeyEnum.modelPermission);

    expect(global.systemCache).toBeDefined();
  });

  it('propagates Cache failures', async () => {
    const error = new Error('redis unavailable');
    mockSystemVersionCache.refresh.mockRejectedValue(error);

    await expect(refreshVersionKey(SystemCacheKeyEnum.modelPermission)).rejects.toBe(error);
  });
});

describe('getVersionKey', () => {
  it.each([
    [undefined, { key: SystemCacheKeyEnum.modelPermission, id: undefined }],
    ['team-1', { key: SystemCacheKeyEnum.modelPermission, id: 'team-1' }]
  ] as const)('returns the Cache value for id %s', async (id, expected) => {
    mockSystemVersionCache.getOrInitialize.mockResolvedValue('stored-version');

    await expect(getVersionKey(SystemCacheKeyEnum.modelPermission, id)).resolves.toBe(
      'stored-version'
    );
    expect(mockSystemVersionCache.getOrInitialize).toHaveBeenCalledWith(expected);
  });

  it('initializes systemCache before reading', async () => {
    expect((global as any).systemCache).toBeUndefined();

    await getVersionKey(SystemCacheKeyEnum.modelPermission);

    expect(global.systemCache).toBeDefined();
  });

  it('propagates Cache failures', async () => {
    const error = new Error('redis unavailable');
    mockSystemVersionCache.getOrInitialize.mockRejectedValue(error);

    await expect(getVersionKey(SystemCacheKeyEnum.modelPermission)).rejects.toBe(error);
  });
});

describe('getCachedData', () => {
  const mockRefreshFunc = vi.fn();

  beforeEach(() => {
    mockRefreshFunc.mockReset();
    serviceEnv.DISABLE_CACHE = false;
  });

  afterEach(() => {
    serviceEnv.DISABLE_CACHE = originalDisableCache;
  });

  it('initializes systemCache on first access', async () => {
    expect((global as any).systemCache).toBeUndefined();

    const result = await getCachedData(SystemCacheKeyEnum.modelPermission);

    expect(global.systemCache).toBeDefined();
    expect(result).toBeNull();
  });

  it('calls refreshFunc on cache miss', async () => {
    const mockData = { permission: true };
    mockRefreshFunc.mockResolvedValue(mockData);
    initCache();
    global.systemCache[SystemCacheKeyEnum.modelPermission].refreshFunc = mockRefreshFunc;

    const result = await getCachedData(SystemCacheKeyEnum.modelPermission);

    expect(mockRefreshFunc).toHaveBeenCalled();
    expect(result).toEqual(mockData);
  });

  it('returns process cache when its version matches', async () => {
    const mockData = { permission: true };
    mockRefreshFunc.mockResolvedValue(mockData);
    initCache();
    global.systemCache[SystemCacheKeyEnum.modelPermission].refreshFunc = mockRefreshFunc;

    await getCachedData(SystemCacheKeyEnum.modelPermission);
    mockRefreshFunc.mockClear();
    const result = await getCachedData(SystemCacheKeyEnum.modelPermission);

    expect(mockRefreshFunc).not.toHaveBeenCalled();
    expect(result).toEqual(mockData);
  });

  it('refreshes when DISABLE_CACHE is true', async () => {
    serviceEnv.DISABLE_CACHE = true;
    mockRefreshFunc.mockResolvedValue({ permission: 'first' });
    initCache();
    global.systemCache[SystemCacheKeyEnum.modelPermission].refreshFunc = mockRefreshFunc;

    await getCachedData(SystemCacheKeyEnum.modelPermission);
    mockRefreshFunc.mockClear();
    mockRefreshFunc.mockResolvedValue({ permission: 'second' });
    const result = await getCachedData(SystemCacheKeyEnum.modelPermission);

    expect(mockRefreshFunc).toHaveBeenCalled();
    expect(result).toEqual({ permission: 'second' });
  });

  it('uses cache for modelPermission when the version matches', async () => {
    const mockPermRefresh = vi.fn().mockResolvedValue({ perm: true });
    initCache();
    global.systemCache[SystemCacheKeyEnum.modelPermission].refreshFunc = mockPermRefresh;

    await getCachedData(SystemCacheKeyEnum.modelPermission);
    expect(mockPermRefresh).toHaveBeenCalledTimes(1);
    mockPermRefresh.mockClear();
    const result = await getCachedData(SystemCacheKeyEnum.modelPermission);

    expect(mockPermRefresh).not.toHaveBeenCalled();
    expect(result).toEqual({ perm: true });
  });

  it('updates the process cache version after refresh', async () => {
    mockRefreshFunc.mockResolvedValue({ permission: true });
    initCache();
    global.systemCache[SystemCacheKeyEnum.modelPermission].refreshFunc = mockRefreshFunc;

    expect(global.systemCache[SystemCacheKeyEnum.modelPermission].versionKey).toBe('');
    await getCachedData(SystemCacheKeyEnum.modelPermission);

    expect(global.systemCache[SystemCacheKeyEnum.modelPermission].versionKey).toBe('version-1');
  });

  it('passes id to the version Cache', async () => {
    const mockPermRefresh = vi.fn().mockResolvedValue({ perm: 'team1' });
    initCache();
    global.systemCache[SystemCacheKeyEnum.modelPermission].refreshFunc = mockPermRefresh;

    const result = await getCachedData(SystemCacheKeyEnum.modelPermission, 'team1');

    expect(result).toEqual({ perm: 'team1' });
    expect(mockSystemVersionCache.getOrInitialize).toHaveBeenCalledWith({
      key: SystemCacheKeyEnum.modelPermission,
      id: 'team1'
    });
  });
});
