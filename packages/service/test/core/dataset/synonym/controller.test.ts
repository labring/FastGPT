import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import {
  cleanupUnusedDatasetSynonymMappings,
  searchDatasetSynonymMappings
} from '@fastgpt/service/core/dataset/synonym/controller';
import { Types } from '@fastgpt/service/common/mongo';

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

  it('searches the requested offset, including zero, and falls back to page numbers', async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const teamId = new Types.ObjectId().toString();
    const datasetId = new Types.ObjectId().toString();
    const config = await MongoDatasetSynonym.create({ teamId, datasetId, version: 2 });
    await MongoDatasetSynonymMapping.create(
      ['alpha', 'beta', 'gamma'].map((term) => ({
        teamId,
        datasetId,
        synonymFileId: config._id,
        fileVersion: config.version,
        logicalMappingId: new Types.ObjectId(),
        standardizedTerm: term,
        normalizedStandardizedTerm: term,
        synonymTerms: [],
        normalizedSynonymTerms: [],
        allTerms: term,
        fingerprint: term
      }))
    );

    for (const { pagination, expected } of [
      { pagination: { pageNum: 2 }, expected: 'beta' },
      { pagination: { pageNum: 2, offset: 0 }, expected: 'alpha' },
      { pagination: { offset: 2 }, expected: 'gamma' }
    ]) {
      const result = await searchDatasetSynonymMappings({
        teamId,
        datasetId,
        pageSize: 1,
        ...pagination
      });
      expect(result.total).toBe(3);
      expect(result.list.map((item) => item.standardizedTerm)).toEqual([expected]);
    }
  });
});
