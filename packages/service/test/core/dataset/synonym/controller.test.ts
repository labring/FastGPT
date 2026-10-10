import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { cleanupUnusedDatasetSynonymMappings } from '@fastgpt/service/core/dataset/synonym/controller';

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

describe('dataset synonym controller', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    vi.clearAllMocks();
  });

  afterAll(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
  });

  it('cleanupUnusedDatasetSynonymMappings returns early without querying MongoDB when disabled', async () => {
    const findConfig = vi.spyOn(MongoDatasetSynonym, 'findOne');
    await cleanupUnusedDatasetSynonymMappings({ teamId: 'team-id', datasetId: 'dataset-id' });
    expect(findConfig).not.toHaveBeenCalled();
  });
});
