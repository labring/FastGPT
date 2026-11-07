import { describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  getSystemInstanceConfigSnapshot,
  reloadSystemInstanceConfig
} from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { serviceEnv } from '@fastgpt/service/env';

describe('getSystemInstanceConfigSnapshot failure behavior', () => {
  it('validates loaded storage policy before publishing a snapshot', async () => {
    const vendor = serviceEnv.STORAGE_VENDOR;
    serviceEnv.STORAGE_VENDOR = 'minio';
    try {
      const initial = await reloadSystemInstanceConfig();
      await MongoSystemInstanceConfig.create({
        domain: 'storage',
        revision: 1,
        overrides: { downloadMode: 'short-redirect', externalEndpoint: '' },
        updatedBy: { actor: 'system' }
      });
      await expect(reloadSystemInstanceConfig()).rejects.toThrow('external endpoint');
      expect(getSystemInstanceConfig()).toBe(initial);
    } finally {
      serviceEnv.STORAGE_VENDOR = vendor;
    }
  });
  it('throws on DB failure and reload preserves the previous successful snapshot', async () => {
    // 首次正常加载一个快照
    const initial = await reloadSystemInstanceConfig();
    expect(initial).toBeDefined();

    const findSpy = vi.spyOn(MongoSystemInstanceConfig, 'find').mockImplementation(() => {
      throw new Error('mongo transient failure');
    });

    try {
      // 失败时必须向上抛错，不能静默返回默认值并替换上一成功快照
      await expect(getSystemInstanceConfigSnapshot()).rejects.toThrow('mongo transient failure');
      await expect(reloadSystemInstanceConfig()).rejects.toThrow('mongo transient failure');

      // 现有内存快照依然保留，绝不降级为默认值
      expect(getSystemInstanceConfig()).toEqual(initial);
    } finally {
      findSpy.mockRestore();
    }
  });
});
