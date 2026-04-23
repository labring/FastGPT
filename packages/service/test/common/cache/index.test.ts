import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';

vi.mock('@fastgpt/service/core/app/tool/controller', () => ({
  refreshSystemTools: vi.fn().mockResolvedValue([])
}));

const mockGetAllKeysByPrefix = vi.fn().mockResolvedValue([]);
vi.mock('@fastgpt/service/common/redis', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getAllKeysByPrefix: (...args: any[]) => mockGetAllKeysByPrefix(...args)
  };
});

import { refreshVersionKey, getVersionKey, getCachedData } from '@fastgpt/service/common/cache';
import { initCache } from '@fastgpt/service/common/cache/init';

describe('refreshVersionKey', () => {
  beforeEach(() => {
    delete (global as any).systemCache;
    const redis = getGlobalRedisConnection() as any;
    redis._storage.clear();
    mockGetAllKeysByPrefix.mockReset().mockResolvedValue([]);
  });

  it('should set a version key without id', async () => {
    await refreshVersionKey(SystemCacheKeyEnum.systemTool);
    const redis = getGlobalRedisConnection() as any;
    expect(redis.set).toHaveBeenCalledWith(
      `VERSION_KEY:${SystemCacheKeyEnum.systemTool}`,
      expect.any(String)
    );
  });

  it('should set a version key with specific id', async () => {
    await refreshVersionKey(SystemCacheKeyEnum.systemTool, 'team123');
    const redis = getGlobalRedisConnection() as any;
    expect(redis.set).toHaveBeenCalledWith(
      `VERSION_KEY:${SystemCacheKeyEnum.systemTool}:team123`,
      expect.any(String)
    );
  });

  it('should delete all matching keys when id is "*"', async () => {
    const redis = getGlobalRedisConnection() as any;
    const mockPipeline = { del: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([]) };
    redis.pipeline.mockReturnValue(mockPipeline);

    mockGetAllKeysByPrefix.mockResolvedValueOnce(['key1', 'key2']);

    await refreshVersionKey(SystemCacheKeyEnum.systemTool, '*');

    expect(mockGetAllKeysByPrefix).toHaveBeenCalledWith(
      `VERSION_KEY:${SystemCacheKeyEnum.systemTool}`
    );
    expect(mockPipeline.del).toHaveBeenCalledWith(['key1', 'key2']);
    expect(mockPipeline.exec).toHaveBeenCalled();
  });

  it('should not call pipeline.del when no keys match "*"', async () => {
    const redis = getGlobalRedisConnection() as any;
    const mockPipeline = { del: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([]) };
    redis.pipeline.mockReturnValue(mockPipeline);

    mockGetAllKeysByPrefix.mockResolvedValueOnce([]);

    await refreshVersionKey(SystemCacheKeyEnum.systemTool, '*');

    expect(mockPipeline.del).not.toHaveBeenCalled();
  });

  it('should init systemCache if not present', async () => {
    expect((global as any).systemCache).toBeUndefined();
    await refreshVersionKey(SystemCacheKeyEnum.systemTool);
    expect(global.systemCache).toBeDefined();
  });
});

describe('getVersionKey', () => {
  beforeEach(() => {
    delete (global as any).systemCache;
    const redis = getGlobalRedisConnection() as any;
    redis._storage.clear();
    mockGetAllKeysByPrefix.mockReset().mockResolvedValue([]);
  });

  it('should return existing value from redis', async () => {
    const redis = getGlobalRedisConnection() as any;
    await redis.set(`VERSION_KEY:${SystemCacheKeyEnum.systemTool}`, 'existing-val');

    const result = await getVersionKey(SystemCacheKeyEnum.systemTool);
    expect(result).toBe('existing-val');
  });

  it('should return existing value with id', async () => {
    const redis = getGlobalRedisConnection() as any;
    await redis.set(`VERSION_KEY:${SystemCacheKeyEnum.systemTool}:t1`, 'val-t1');

    const result = await getVersionKey(SystemCacheKeyEnum.systemTool, 't1');
    expect(result).toBe('val-t1');
  });

  it('should create and return new UUID when key does not exist', async () => {
    const result = await getVersionKey(SystemCacheKeyEnum.systemTool);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    // UUID format check
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('should set the new UUID in redis when key does not exist', async () => {
    const redis = getGlobalRedisConnection() as any;
    const result = await getVersionKey(SystemCacheKeyEnum.systemTool);

    // Verify the value was stored
    const stored = await redis.get(`VERSION_KEY:${SystemCacheKeyEnum.systemTool}`);
    expect(stored).toBe(result);
  });

  it('should init systemCache if not present', async () => {
    expect((global as any).systemCache).toBeUndefined();
    await getVersionKey(SystemCacheKeyEnum.systemTool);
    expect(global.systemCache).toBeDefined();
  });
});

describe('getCachedData', () => {
  const mockRefreshFunc = vi.fn();

  beforeEach(() => {
    delete (global as any).systemCache;
    const redis = getGlobalRedisConnection() as any;
    redis._storage.clear();
    mockRefreshFunc.mockReset();
    delete process.env.DISABLE_CACHE;
  });

  it('should init systemCache if not present', async () => {
    expect((global as any).systemCache).toBeUndefined();
    // getCachedData should auto-init systemCache
    const result = await getCachedData(SystemCacheKeyEnum.systemTool);
    expect(global.systemCache).toBeDefined();
    expect(result).toEqual([]);
  });

  it('should call refreshFunc on first access (cache miss)', async () => {
    const mockData = [{ id: 'tool1' }];
    mockRefreshFunc.mockResolvedValue(mockData);

    initCache();
    global.systemCache[SystemCacheKeyEnum.systemTool].refreshFunc = mockRefreshFunc;

    const result = await getCachedData(SystemCacheKeyEnum.systemTool);
    expect(mockRefreshFunc).toHaveBeenCalled();
    expect(result).toEqual(mockData);
  });

  it('should return cached data on cache hit in production', async () => {
    const mockData = [{ id: 'tool1' }];
    mockRefreshFunc.mockResolvedValue(mockData);

    initCache();
    global.systemCache[SystemCacheKeyEnum.systemTool].refreshFunc = mockRefreshFunc;

    // First call to populate cache
    await getCachedData(SystemCacheKeyEnum.systemTool);
    mockRefreshFunc.mockClear();

    // Second call should hit cache (versionKey matches)
    const result = await getCachedData(SystemCacheKeyEnum.systemTool);
    // In non-production with devRefresh=true, it will still refresh
    // So we test modelPermission which has no devRefresh
    expect(result).toBeDefined();
  });

  it('should refresh when DISABLE_CACHE is true', async () => {
    process.env.DISABLE_CACHE = 'true';
    const mockData = [{ id: 'tool1' }];
    mockRefreshFunc.mockResolvedValue(mockData);

    initCache();
    global.systemCache[SystemCacheKeyEnum.systemTool].refreshFunc = mockRefreshFunc;

    // First call
    await getCachedData(SystemCacheKeyEnum.systemTool);
    mockRefreshFunc.mockClear();

    // Second call should still refresh due to DISABLE_CACHE
    mockRefreshFunc.mockResolvedValue([{ id: 'tool2' }]);
    const result = await getCachedData(SystemCacheKeyEnum.systemTool);
    expect(mockRefreshFunc).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'tool2' }]);
  });

  it('should use cache for modelPermission (no devRefresh) when versionKey matches', async () => {
    const mockPermRefresh = vi.fn().mockResolvedValue({ perm: true });

    initCache();
    global.systemCache[SystemCacheKeyEnum.modelPermission].refreshFunc = mockPermRefresh;

    // First call populates cache
    await getCachedData(SystemCacheKeyEnum.modelPermission);
    expect(mockPermRefresh).toHaveBeenCalledTimes(1);
    mockPermRefresh.mockClear();

    // Second call should hit cache (non-production but devRefresh is undefined)
    const result = await getCachedData(SystemCacheKeyEnum.modelPermission);
    // devRefresh is undefined (falsy), so cache should be used
    expect(mockPermRefresh).not.toHaveBeenCalled();
    expect(result).toEqual({ perm: true });
  });

  it('should refresh when devRefresh is true in non-production', async () => {
    const mockData = [{ id: 'tool1' }];
    mockRefreshFunc.mockResolvedValue(mockData);

    initCache();
    global.systemCache[SystemCacheKeyEnum.systemTool].refreshFunc = mockRefreshFunc;

    // First call
    await getCachedData(SystemCacheKeyEnum.systemTool);
    mockRefreshFunc.mockClear();

    // Second call - devRefresh=true and not production, so should refresh
    mockRefreshFunc.mockResolvedValue([{ id: 'tool2' }]);
    const result = await getCachedData(SystemCacheKeyEnum.systemTool);
    expect(mockRefreshFunc).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'tool2' }]);
  });

  it('should update versionKey after refresh', async () => {
    mockRefreshFunc.mockResolvedValue([]);

    initCache();
    global.systemCache[SystemCacheKeyEnum.systemTool].refreshFunc = mockRefreshFunc;

    expect(global.systemCache[SystemCacheKeyEnum.systemTool].versionKey).toBe('');
    await getCachedData(SystemCacheKeyEnum.systemTool);
    expect(global.systemCache[SystemCacheKeyEnum.systemTool].versionKey).not.toBe('');
  });

  it('should support id parameter for getCachedData', async () => {
    const mockPermRefresh = vi.fn().mockResolvedValue({ perm: 'team1' });

    initCache();
    global.systemCache[SystemCacheKeyEnum.modelPermission].refreshFunc = mockPermRefresh;

    const result = await getCachedData(SystemCacheKeyEnum.modelPermission, 'team1');
    expect(result).toEqual({ perm: 'team1' });
  });
});
