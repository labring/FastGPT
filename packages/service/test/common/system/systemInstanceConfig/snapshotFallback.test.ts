import { describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { getSystemInstanceConfigSnapshot } from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { getDomainDefaultConfig } from '@fastgpt/global/common/system/config';

describe('getSystemInstanceConfigSnapshot fallback behavior', () => {
  it('falls back to full defaults when the DB read fails', async () => {
    const findSpy = vi.spyOn(MongoSystemInstanceConfig, 'find').mockImplementation(() => {
      throw new Error('mongo transient failure');
    });

    try {
      const snapshot = await getSystemInstanceConfigSnapshot();

      // 降级为全默认配置，不向上抛出（启动期 DB 抖动不应导致服务崩溃）
      expect(snapshot.site).toEqual(getDomainDefaultConfig('site'));
      expect(snapshot.storage.downloadMode).toBe(getDomainDefaultConfig('storage').downloadMode);
    } finally {
      findSpy.mockRestore();
    }
  });
});
