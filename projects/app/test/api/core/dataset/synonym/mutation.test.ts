import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSynonymMutationTypeEnum } from '@fastgpt/global/core/dataset/synonym';
import { serviceEnv } from '@fastgpt/service/env';

const { mockCreateDatasetSynonymMutation } = vi.hoisted(() => ({
  mockCreateDatasetSynonymMutation: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/core/dataset/synonym/mutation', () => ({
  createDatasetSynonymMutation: mockCreateDatasetSynonymMutation
}));

import uploadHandler from '@/pages/api/core/dataset/synonym/upload';
import updateHandler from '@/pages/api/core/dataset/synonym/update';

const datasetId = '68ee0bd23d17260b7829b134';
const synonymId = '68ee0bd23d17260b7829b136';
const response = {
  synonymId,
  fileName: 'api-synonyms.csv',
  size: 50,
  uploadTime: new Date('2026-08-18T00:00:00.000Z'),
  fileVersion: 2,
  affectedDataCount: 0
};

describe('dataset synonym JSON mutation APIs', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    vi.clearAllMocks();
    mockCreateDatasetSynonymMutation.mockResolvedValue(response);
  });

  it('normalizes JSON mappings and creates an upload snapshot', async () => {
    const req = {
      body: {
        datasetId,
        fileName: 'api-synonyms.csv',
        mappings: [{ standardizedTerm: 'Refund', synonymTerms: ['refund request'] }]
      }
    } as any;

    await expect(uploadHandler(req)).resolves.toEqual(response);
    expect(mockCreateDatasetSynonymMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        datasetId,
        fileName: 'api-synonyms.csv',
        type: DatasetSynonymMutationTypeEnum.upload,
        size: expect.any(Number),
        mappings: [
          expect.objectContaining({
            standardizedTerm: 'Refund',
            normalizedStandardizedTerm: 'refund',
            synonymTerms: ['refund request']
          })
        ]
      })
    );
  });

  it('passes stale-page protection to a JSON update', async () => {
    const req = {
      body: {
        datasetId,
        oldSynonymId: synonymId,
        oldFileVersion: 1,
        mappings: [{ standardizedTerm: 'Order', synonymTerms: ['purchase'] }]
      }
    } as any;

    await expect(updateHandler(req)).resolves.toEqual(response);
    expect(mockCreateDatasetSynonymMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSynonymId: synonymId,
        expectedFileVersion: 1,
        type: DatasetSynonymMutationTypeEnum.update,
        fileName: 'synonyms.csv'
      })
    );
  });
});
