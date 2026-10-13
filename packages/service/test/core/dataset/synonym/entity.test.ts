import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import {
  assertDatasetSynonymEnabled,
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
});
