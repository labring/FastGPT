import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { serviceEnv } from '@fastgpt/service/env';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import {
  assertDatasetSynonymEnabled,
  getCachedDatasetSynonymConfig,
  getDatasetSynonymRuntimeConfig,
  getDatasetSynonymTransformContext
} from '@fastgpt/service/core/dataset/synonym/entity';

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

describe('dataset synonym feature switch', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
  });

  afterAll(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
  });

  it('returns no-op runtime values without querying MongoDB when disabled', async () => {
    const findConfig = vi.spyOn(MongoDatasetSynonym, 'findOne');

    await expect(
      getDatasetSynonymRuntimeConfig({ teamId: 'team-id', datasetId: 'dataset-id' })
    ).resolves.toBeNull();
    const context = await getDatasetSynonymTransformContext({
      teamId: 'team-id',
      datasetId: 'dataset-id'
    });

    expect(context.version).toBe(0);
    expect(context.transformText('keep original text')).toBe('keep original text');
    await expect(context.isCurrent()).resolves.toBe(true);
    expect(findConfig).not.toHaveBeenCalled();
  });

  it('rejects management operations when disabled', () => {
    expect(() => assertDatasetSynonymEnabled()).toThrow('知识库同义词功能未启用');
  });

  it('reads the latest synonym config for writes with a stale local cache', async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const scope = { teamId: String(new Types.ObjectId()), datasetId: String(new Types.ObjectId()) };
    await expect(getCachedDatasetSynonymConfig(scope)).resolves.toBeNull();

    // 模拟另一个进程保存并发布词表，本地缓存仍持有旧快照。
    const config = await MongoDatasetSynonym.create({ ...scope, version: 1, enabled: true });
    await MongoDatasetSynonymMapping.create({
      ...scope,
      synonymFileId: config._id,
      logicalMappingId: new Types.ObjectId(),
      fileVersion: 1,
      standardizedTerm: '退款',
      normalizedStandardizedTerm: '退款',
      synonymTerms: ['退钱'],
      normalizedSynonymTerms: ['退钱'],
      allTerms: '退款 退钱',
      fingerprint: 'version-1'
    });

    const context = await getDatasetSynonymTransformContext(scope);
    expect(context.version).toBe(1);
    expect(context.transformText('如何退钱')).toBe('如何退款');
    await expect(context.isCurrent()).resolves.toBe(true);

    await config.updateOne({ $set: { version: 2, enabled: false } });
    await expect(context.isCurrent()).resolves.toBe(false);
    const disabled = await getDatasetSynonymTransformContext(scope);
    expect(disabled.version).toBe(2);
    expect(disabled.transformText('如何退钱')).toBe('如何退钱');
    await expect(disabled.isCurrent()).resolves.toBe(true);
  });
});
