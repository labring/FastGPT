import { describe, expect, it, vi } from 'vitest';

// 全局 s3 mock 把 getS3AvatarSource 替换成了每次返回新对象的工厂，
// 且 initS3Buckets 也是 mock；这里解除这两个模块的 mock 以测试真实单例失效逻辑。
// buckets/* 与 queue/delete 仍走 mock，不会建立真实 S3 连接。
vi.unmock('@fastgpt/service/common/s3');
vi.unmock('@fastgpt/service/common/s3/sources/avatar');

const { initS3Buckets } = await import('@fastgpt/service/common/s3');
const { getS3AvatarSource } = await import('@fastgpt/service/common/s3/sources/avatar');

describe('initS3Buckets avatar singleton invalidation', () => {
  it('replaces the cached avatar source so it picks up new storage config', () => {
    const before = getS3AvatarSource();
    // 单例语义：未重建时始终返回同一实例
    expect(getS3AvatarSource()).toBe(before);

    // 存储实例配置变更后重建 bucket：头像单例必须一并失效
    initS3Buckets();

    const after = getS3AvatarSource();
    expect(after).not.toBe(before);
    expect(after).toBeDefined();
    // 重建后恢复单例语义
    expect(getS3AvatarSource()).toBe(after);
  });
});
