import { describe, it, expect, beforeEach } from 'vitest';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';

import { initCache } from '@fastgpt/service/common/cache/init';

describe('initCache', () => {
  beforeEach(() => {
    delete (global as any).systemCache;
  });

  it('should initialize global.systemCache', () => {
    initCache();
    expect(global.systemCache).toBeDefined();
  });

  it('should set up modelPermission cache entry', () => {
    initCache();
    const entry = global.systemCache[SystemCacheKeyEnum.modelPermission];
    expect(entry.versionKey).toBe('');
    expect(entry.data).toBeNull();
    expect(entry.devRefresh).toBeUndefined();
  });

  it('modelPermission refreshFunc should resolve to null', async () => {
    initCache();
    const result = await global.systemCache[SystemCacheKeyEnum.modelPermission].refreshFunc();
    expect(result).toBeNull();
  });

  it('should overwrite existing systemCache when called again', () => {
    initCache();
    global.systemCache[SystemCacheKeyEnum.modelPermission].versionKey = 'old';
    initCache();
    expect(global.systemCache[SystemCacheKeyEnum.modelPermission].versionKey).toBe('');
  });
});
