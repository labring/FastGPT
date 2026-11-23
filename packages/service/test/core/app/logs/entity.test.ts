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

  it('recovers after multi-batch replica lag while throttling permanently missing version queries via backoff', async () => {
    const teamMemberId = new Types.ObjectId();
    const appId = new Types.ObjectId();
    const version = await MongoAppVersion.create({
      tmbId: teamMemberId,
      appId,
      versionName: 'v-sync',
      nodes: [],
      edges: []
    });
    const versionIdStr = String(version._id);
    const deletedVersionId = new Types.ObjectId();

    const originalFind = MongoAppVersion.find.bind(MongoAppVersion);
    let callCount = 0;
    vi.spyOn(MongoAppVersion, 'find').mockImplementation(((
      filter: any,
      projection: any,
      options: any
    ) => {
      callCount += 1;
      // 模拟前 2 次查从库均因滞后查空；第 3 次（第 4 批退避窗口到期）副本追平，仅命中真实版本
      if (callCount <= 2) {
        return { lean: async () => [] } as any;
      }
      return originalFind(filter, projection, options);
    }) as any);

    const clock = 1000;
    const loader = createAppVersionNameLoader({
      maxMissBackoffBatches: 64,
      missRetryTtlMs: 5000,
      now: () => clock
    });

    // 第 1 批：两类 ID 均查空（miss #1 -> 下次重试第 2 批）
    await loader.preload([versionIdStr, deletedVersionId, undefined, null]);
    expect(callCount).toBe(1);
    expect(loader.get(versionIdStr)).toBe('');
    expect(loader.get(deletedVersionId)).toBe('');
    expect(loader.get(undefined)).toBe('');

    // 第 2 批：继续滞后查空（miss #2 -> 指数退避 2 批，下次重试第 4 批）
    await loader.preload([version._id, deletedVersionId]);
    expect(callCount).toBe(2);
    expect(loader.get(versionIdStr)).toBe('');

    // 第 3 批：未到退避窗口且未超过 TTL，跳过查询
    await loader.preload([version._id, deletedVersionId]);
    expect(callCount).toBe(2);
    expect(loader.get(versionIdStr)).toBe('');

    // 第 4 批：退避窗口到期重新探测，真实版本恢复并写入长期缓存；已删版本继续退避（下次重试第 8 批）
    await loader.preload([version._id, deletedVersionId]);
    expect(callCount).toBe(3);
    expect(loader.get(versionIdStr)).toBe('v-sync');
    expect(loader.get(version._id)).toBe('v-sync');
    expect(loader.get(deletedVersionId)).toBe('');

    // 第 5~16 批：真实版本恒定走缓存，已删版本仅在第 8、16 批探测（共 5 次而非 16 次）
    for (let batch = 5; batch <= 16; batch++) {
      await loader.preload([versionIdStr, deletedVersionId]);
      expect(loader.get(versionIdStr)).toBe('v-sync');
      expect(loader.get(deletedVersionId)).toBe('');
    }
    expect(callCount).toBe(5);
  });

  it('retries missed version IDs immediately once missRetryTtlMs expires', async () => {
    const version = await MongoAppVersion.create({
      tmbId: new Types.ObjectId(),
      appId: new Types.ObjectId(),
      versionName: 'v-ttl-recover',
      nodes: [],
      edges: []
    });

    const originalFind = MongoAppVersion.find.bind(MongoAppVersion);
    let callCount = 0;
    vi.spyOn(MongoAppVersion, 'find').mockImplementation(((
      filter: any,
      projection: any,
      options: any
    ) => {
      callCount += 1;
      if (callCount <= 2) {
        return { lean: async () => [] } as any;
      }
      return originalFind(filter, projection, options);
    }) as any);

    let clock = 1000;
    const loader = createAppVersionNameLoader({
      maxMissBackoffBatches: 64,
      missRetryTtlMs: 5000,
      now: () => clock
    });

    // 连续两批查空后，批次退避目标为第 4 批
    await loader.preload([version._id]);
    await loader.preload([version._id]);
    expect(callCount).toBe(2);

    // 超过 missRetryTtlMs 后，第 3 批无需等到第 4 批即可提前探测并恢复
    clock += 5000;
    await loader.preload([version._id]);
    expect(callCount).toBe(3);
    expect(loader.get(version._id)).toBe('v-ttl-recover');

    // 命中缓存后后续批次不再查库
    clock += 10000;
    await loader.preload([version._id]);
    expect(callCount).toBe(3);
  });
});
