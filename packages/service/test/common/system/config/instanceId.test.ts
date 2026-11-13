import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import {
  getInstanceId,
  resetInstanceIdCacheForTest
} from '@fastgpt/service/common/system/config/instanceId';

describe('getInstanceId', () => {
  beforeEach(async () => {
    resetInstanceIdCacheForTest();
    await MongoSystemConfigs.deleteMany({ type: SystemConfigsTypeEnum.instanceId });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetInstanceIdCacheForTest();
  });

  it('generates and persists a 32-character hex ID, then memoizes in memory without further DB locks', async () => {
    const findOneSpy = vi.spyOn(MongoSystemConfigs, 'findOne');
    const findOneAndUpdateSpy = vi.spyOn(MongoSystemConfigs, 'findOneAndUpdate');

    const id = await getInstanceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(findOneSpy).not.toHaveBeenCalled();
    expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(1);

    // Subsequent calls hit the process-level promise cache without touching MongoDB
    await expect(getInstanceId()).resolves.toBe(id);
    await expect(getInstanceId()).resolves.toBe(id);
    expect(findOneSpy).not.toHaveBeenCalled();
    expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(1);

    const doc = await MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.instanceId
    });
    expect(doc?._id.toString()).toBe('000000000000000000000001');
    expect(doc?.value?.instanceId).toBe(id);
  });

  it('preserves an existing deployment identity across cold starts via $setOnInsert', async () => {
    const instanceId = '0123456789abcdef0123456789abcdef';
    await MongoSystemConfigs.create({
      _id: '000000000000000000000001',
      type: SystemConfigsTypeEnum.instanceId,
      value: { instanceId }
    });

    await expect(getInstanceId()).resolves.toBe(instanceId);
    await expect(MongoSystemConfigs.countDocuments()).resolves.toBe(1);
  });

  it('falls back to reading the winning document on E11000 duplicate-key race during cold start', async () => {
    const winnerId = 'fedcba9876543210fedcba9876543210';
    await MongoSystemConfigs.create({
      _id: '000000000000000000000001',
      type: SystemConfigsTypeEnum.instanceId,
      value: { instanceId: winnerId }
    });

    vi.spyOn(MongoSystemConfigs, 'findOneAndUpdate').mockReturnValueOnce({
      lean: async () => {
        throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
      }
    } as any);

    await expect(getInstanceId()).resolves.toBe(winnerId);
  });

  it('returns the same ID for repeated and concurrent calls', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => getInstanceId()));

    expect(new Set(ids).size).toBe(1);
    await expect(getInstanceId()).resolves.toBe(ids[0]);
    await expect(
      MongoSystemConfigs.countDocuments({ type: SystemConfigsTypeEnum.instanceId })
    ).resolves.toBe(1);
  });
});
