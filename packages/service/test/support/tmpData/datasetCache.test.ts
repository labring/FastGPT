import { beforeEach, describe, expect, it } from 'vitest';
import { createDatasetCache } from '@fastgpt/service/support/tmpData/datasetCache';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';

describe('createDatasetCache', () => {
  beforeEach(async () => {
    await MongoTmpData.deleteMany({});
  });

  it.each([[], [{ id: 'doc' }], false, 0, null].map((value) => ({ value })))(
    '保存并读取值 %j，读取不续期',
    async ({ value }) => {
      const cache = createDatasetCache({ namespace: 'browse', ttlMs: 180_000 });
      expect(await cache.get('missing')).toBeUndefined();
      const startedAt = Date.now();
      await cache.set('key', value);
      const beforeRead = await MongoTmpData.findOne({}).lean();
      expect(beforeRead!.expireAt.getTime()).toBeGreaterThanOrEqual(startedAt + 180_000);
      expect(beforeRead!.expireAt.getTime()).toBeLessThanOrEqual(Date.now() + 180_000);
      expect(await cache.get('key')).toEqual(value);
      expect((await MongoTmpData.findOne({}).lean())!.expireAt).toEqual(beforeRead!.expireAt);
    }
  );

  it('主动排除过期记录，不依赖 TTL 清理', async () => {
    const cache = createDatasetCache({ namespace: 'browse', ttlMs: 180_000 });
    await cache.set('key', ['old']);
    await MongoTmpData.updateOne({}, { $set: { expireAt: new Date(Date.now() - 1) } });
    expect(await cache.get('key')).toBeUndefined();
    await cache.set('key', ['new']);
    expect(await cache.get('key')).toEqual(['new']);
    expect(await MongoTmpData.countDocuments({})).toBe(1);
  });

  it('namespace 和 key 独立，key 中的凭证不落库', async () => {
    const first = createDatasetCache({ namespace: 'first', ttlMs: 180_000 });
    const second = createDatasetCache({ namespace: 'second', ttlMs: 180_000 });
    await first.set('token-secret', ['first']);
    await second.set('token-secret', ['second']);
    await first.set('another-key', ['another']);
    expect(await first.get('token-secret')).toEqual(['first']);
    expect(await second.get('token-secret')).toEqual(['second']);
    expect(await first.get('another-key')).toEqual(['another']);
    const entries = await MongoTmpData.find({}).lean();
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => /^datasetCache:v1:[0-9a-f]+$/.test(entry.dataId))).toBe(true);
    expect(entries.every((entry) => !entry.dataId.includes('token-secret'))).toBe(true);
  });
});
