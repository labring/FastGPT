import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { MongoIndexManager } from '@fastgpt/service/common/mongo/indexManager';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoLLMRequestRecord } from '@fastgpt/service/core/ai/record/schema';
import { refreshLLMRequestRecordTTL } from '@fastgpt/service/core/ai/record/service';

const model = MongoLLMRequestRecord;
const originalSnapshot = global.systemInstanceConfig;

/** 使用完整快照模拟启动加载或配置 reload，不依赖 ENV 兜底。 */
const setRetentionHours = (hours: number) => {
  const snapshot = resolveSystemInstanceConfig({});
  snapshot.performance.tracking.retentionHours = hours;
  global.systemInstanceConfig = snapshot;
};

const getTTLIndex = async () =>
  (await model.collection.indexes()).find((index) => index.name === 'createdAt_1');

describe('refreshLLMRequestRecordTTL', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    setRetentionHours(6);
    // 每个用例只清理专属日志测试集合的 TTL 索引，避免不同 TTL 预期互相影响。
    await model.collection.dropIndex('createdAt_1').catch((error) => {
      if (error.code !== 26 && error.code !== 27) throw error;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.systemInstanceConfig = originalSnapshot;
  });

  it('creates the missing TTL index using the loaded configuration', async () => {
    setRetentionHours(48);
    expect(await refreshLLMRequestRecordTTL()).toBe(true);
    expect(await getTTLIndex()).toMatchObject({
      name: 'createdAt_1',
      key: { createdAt: 1 },
      expireAfterSeconds: 48 * 3600
    });
  });

  it('creates the collection and TTL index when the namespace does not exist yet', async () => {
    await model.collection.drop();
    expect(await refreshLLMRequestRecordTTL()).toBe(true);
    expect(await getTTLIndex()).toMatchObject({ expireAfterSeconds: 6 * 3600 });
  });

  it.each([48, 1])(
    'changes an existing TTL to %s hours without dropping indexes',
    async (hours) => {
      await model.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 6 * 3600 });
      await model.collection.createIndex({ requestId: 1 }, { name: 'customer_request_lookup' });
      const dropIndex = vi.spyOn(model.collection, 'dropIndex');
      const createIndex = vi.spyOn(model.collection, 'createIndex');
      const mainCommand = vi.spyOn(connectionMongo.connection.db!, 'command');
      const logCommand = vi.spyOn(model.db.db!, 'command');
      setRetentionHours(hours);

      expect(await refreshLLMRequestRecordTTL()).toBe(true);
      expect(logCommand).toHaveBeenCalledWith({
        collMod: model.collection.collectionName,
        index: { name: 'createdAt_1', expireAfterSeconds: hours * 3600 }
      });
      expect(mainCommand).not.toHaveBeenCalled();
      expect(dropIndex).not.toHaveBeenCalled();
      expect(createIndex).not.toHaveBeenCalled();
      expect(await getTTLIndex()).toMatchObject({ expireAfterSeconds: hours * 3600 });
      expect(
        (await model.collection.indexes()).some((index) => index.name === 'customer_request_lookup')
      ).toBe(true);

      // Schema 声明也保持一致，之后统一索引同步不会尝试用模块加载时的 TTL 覆盖或重建。
      await expect(MongoIndexManager.syncModelIndexes({ model })).resolves.toBeDefined();
      expect(await getTTLIndex()).toMatchObject({ expireAfterSeconds: hours * 3600 });
      expect(dropIndex).not.toHaveBeenCalled();
    }
  );

  it('does not issue collMod when the database already has the requested TTL', async () => {
    await model.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 6 * 3600 });
    const command = vi.spyOn(model.db.db!, 'command');
    const createIndex = vi.spyOn(model.collection, 'createIndex');

    expect(await refreshLLMRequestRecordTTL()).toBe(true);
    expect(command).not.toHaveBeenCalled();
    expect(createIndex).not.toHaveBeenCalled();
  });

  it('keeps the old TTL on failure and retries from the database on the next reload', async () => {
    await model.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 6 * 3600 });
    setRetentionHours(48);
    const command = vi
      .spyOn(model.db.db!, 'command')
      .mockRejectedValueOnce(new Error('no collMod permission'));

    await expect(refreshLLMRequestRecordTTL()).resolves.toBe(false);
    expect(await getTTLIndex()).toMatchObject({ expireAfterSeconds: 6 * 3600 });
    expect(await refreshLLMRequestRecordTTL()).toBe(true);
    expect(command).toHaveBeenCalledTimes(2);
    expect(await getTTLIndex()).toMatchObject({ expireAfterSeconds: 48 * 3600 });
  });

  it('reports an index read failure without rejecting the configuration reload', async () => {
    vi.spyOn(model.collection, 'indexes').mockRejectedValueOnce(
      new Error('index read unavailable')
    );
    await expect(refreshLLMRequestRecordTTL()).resolves.toBe(false);
  });

  it.each([
    { field: 'customerDate', options: { expireAfterSeconds: 3600 } },
    { field: 'createdAt', options: {} }
  ])('preserves an incompatible index named createdAt_1: %j', async ({ field, options }) => {
    await model.collection.createIndex({ [field]: 1 }, { name: 'createdAt_1', ...options });
    const command = vi.spyOn(model.db.db!, 'command');

    expect(await refreshLLMRequestRecordTTL()).toBe(false);
    expect(command).not.toHaveBeenCalled();
    expect(await getTTLIndex()).toMatchObject({ key: { [field]: 1 }, ...options });
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000])(
    'rejects unsupported TTL hours %s before touching indexes',
    async (hours) => {
      setRetentionHours(hours);
      const indexes = vi.spyOn(model.collection, 'indexes');
      expect(await refreshLLMRequestRecordTTL()).toBe(false);
      expect(indexes).not.toHaveBeenCalled();
    }
  );
});
