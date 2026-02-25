import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';

vi.mock('@fastgpt/service/core/app/tool/controller', () => ({
  refreshSystemTools: vi.fn().mockResolvedValue([])
}));

import { initCache } from '@fastgpt/service/common/cache/init';
import { refreshSystemTools } from '@fastgpt/service/core/app/tool/controller';

describe('initCache', () => {
  beforeEach(() => {
    delete (global as any).systemCache;
  });

  it('should initialize global.systemCache', () => {
    initCache();
    expect(global.systemCache).toBeDefined();
  });

  it('should set up systemTool cache entry', () => {
    initCache();
    const entry = global.systemCache[SystemCacheKeyEnum.systemTool];
    expect(entry.versionKey).toBe('');
    expect(entry.data).toEqual([]);
    expect(entry.refreshFunc).toBe(refreshSystemTools);
    expect(entry.devRefresh).toBe(true);
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
    global.systemCache[SystemCacheKeyEnum.systemTool].versionKey = 'old';
    initCache();
    expect(global.systemCache[SystemCacheKeyEnum.systemTool].versionKey).toBe('');
  });
});
