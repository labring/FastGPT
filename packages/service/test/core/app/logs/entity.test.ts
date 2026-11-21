import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '../../../../common/mongo';
import { MongoAppVersion } from '../../../../core/app/version/schema';
import {
  computeAverageResponseTime,
  createAppVersionNameLoader
} from '../../../../core/app/logs/entity';

describe('core/app/logs/entity helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes average response time safely for zero and positive AI counts', () => {
    expect(computeAverageResponseTime(10, 0)).toBe(0);
    expect(computeAverageResponseTime(undefined, undefined)).toBe(0);
    expect(computeAverageResponseTime(9, 4)).toBe(2.25);
  });

  it('recovers transient replica lag on retry while bounding permanently missing version queries', async () => {
    const teamMemberId = new Types.ObjectId();
    const appId = new Types.ObjectId();
    const version = await MongoAppVersion.create({
      tmbId: teamMemberId,
      appId,
      versionName: 'v-sync',
      nodes: [],
      edges: []
    });
    const versionUpperHex = String(version._id).toUpperCase();
    const deletedVersionId = new Types.ObjectId();

    const originalFind = MongoAppVersion.find.bind(MongoAppVersion);
    let callCount = 0;
    vi.spyOn(MongoAppVersion, 'find').mockImplementation(((
      filter: any,
      projection: any,
      options: any
    ) => {
      callCount += 1;
      // 模拟第 1 批从库滞后查空；第 2 批副本追平仅命中真实版本，已删版本仍查空
      if (callCount === 1) {
        return { lean: async () => [] } as any;
      }
      return originalFind(filter, projection, options);
    }) as any);

    const loader = createAppVersionNameLoader({ maxMissRetries: 1 });

    // 第 1 批：两类 ID 均未命中，允许下批重试一次
    await loader.preload([versionUpperHex, deletedVersionId, 123, 'short-id']);
    expect(callCount).toBe(1);
    expect(loader.get(versionUpperHex)).toBe('');
    expect(loader.get(deletedVersionId)).toBe('');
    expect(loader.get(123)).toBe('');

    // 第 2 批：真实版本恢复并缓存，已删版本达重试上限后固化负缓存
    await loader.preload([version._id, deletedVersionId]);
    expect(callCount).toBe(2);
    expect(loader.get(versionUpperHex)).toBe('v-sync');
    expect(loader.get(version._id)).toBe('v-sync');
    expect(loader.get(deletedVersionId)).toBe('');

    // 第 3 批：两类 ID 均命中缓存，不再发库查询
    await loader.preload([versionUpperHex, deletedVersionId]);
    expect(callCount).toBe(2);
  });
});
