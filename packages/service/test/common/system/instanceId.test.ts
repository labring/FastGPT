/**
 * 部署实例 ID（getInstanceId）测试 — 见 .agents/design/admin/license-instance-id-redesign.md §6.4
 * 验证：32 位 hex 格式、幂等（两次调用同 ID）、并发原子生成（全集群只生成一次）。
 */
import { describe, expect, it } from 'vitest';
import { getInstanceId } from '@fastgpt/service/common/system/config/instanceId';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';

describe('getInstanceId', () => {
  it('生成 32 位 hex 格式 ID，且落库为独立 type instanceId', async () => {
    const id = await getInstanceId();

    expect(id).toMatch(/^[0-9a-f]{32}$/);

    const doc = await MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.instanceId
    });
    expect(doc).toBeTruthy();
    expect(doc?.value?.instanceId).toBe(id);
  });

  it('幂等：连续两次调用返回相同 ID（不重新生成）', async () => {
    const first = await getInstanceId();
    const second = await getInstanceId();

    expect(second).toBe(first);

    const count = await MongoSystemConfigs.countDocuments({
      type: SystemConfigsTypeEnum.instanceId
    });
    expect(count).toBe(1);
  });

  it('并发原子生成：多个实例同时首启只生成一个 ID', async () => {
    // 清理已存在的 instanceId 记录，模拟首次启动
    await MongoSystemConfigs.deleteMany({ type: SystemConfigsTypeEnum.instanceId });

    const ids = await Promise.all(Array.from({ length: 8 }, () => getInstanceId()));

    // $setOnInsert + upsert 保证全集群只有一个 ID
    expect(new Set(ids).size).toBe(1);
    const count = await MongoSystemConfigs.countDocuments({
      type: SystemConfigsTypeEnum.instanceId
    });
    expect(count).toBe(1);
  });
});
