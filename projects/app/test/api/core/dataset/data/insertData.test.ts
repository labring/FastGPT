import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parseApiInput: vi.fn(),
  authDatasetCollection: vi.fn(),
  checkDatasetIndexLimit: vi.fn(),
  getCollectionWithDataset: vi.fn(),
  getEmbeddingModelData: vi.fn(),
  hasSameValue: vi.fn(),
  createDatasetData: vi.fn(),
  mongoSessionRun: vi.fn(),
  pushGenerateVectorUsage: vi.fn(),
  addAuditLog: vi.fn(),
  getI18nDatasetType: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/common/zod/requestParseError', () => ({
  parseApiInput: mocks.parseApiInput
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: mocks.authDatasetCollection
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: mocks.checkDatasetIndexLimit
}));

vi.mock('@fastgpt/service/core/dataset/controller', () => ({
  getCollectionWithDataset: mocks.getCollectionWithDataset
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModelData: mocks.getEmbeddingModelData
}));

vi.mock('@/service/core/dataset/data/utils', () => ({
  hasSameValue: mocks.hasSameValue
}));

vi.mock('@/service/core/dataset/data/data', () => ({
  createDatasetData: mocks.createDatasetData
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.mongoSessionRun
}));

vi.mock('@/service/support/wallet/usage/push', () => ({
  pushGenerateVectorUsage: mocks.pushGenerateVectorUsage
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: mocks.addAuditLog,
  getI18nDatasetType: mocks.getI18nDatasetType
}));

import handler from '@/pages/api/core/dataset/data/insertData';

const collectionId = '68ad85a7463006c963799a06';
const datasetId = '68ad85a7463006c963799a07';
const insertId = '68ad85a7463006c963799a08';
const session = { id: 'session' };
const embeddingModelData = {
  modelId: '68ad85a7463006c963799a09',
  model: 'embedding-model'
};

describe('POST /api/core/dataset/data/insertData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseApiInput.mockReturnValue({
      body: {
        collectionId,
        q: ' question ',
        a: ' answer ',
        indexes: [{ type: 'custom', text: ' custom index ' }],
        metadata: { source: 'manual' }
      }
    });
    mocks.authDatasetCollection.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      collection: {
        name: 'Collection',
        dataset: { name: 'Dataset', type: 'dataset' }
      }
    });
    mocks.getCollectionWithDataset.mockResolvedValue({
      dataset: { _id: datasetId, vectorModel: 'embedding-model' },
      indexPrefixTitle: true,
      imageIndex: true,
      indexSize: 512,
      name: 'Collection'
    });
    mocks.getEmbeddingModelData.mockReturnValue(embeddingModelData);
    mocks.mongoSessionRun.mockImplementation((fn) => fn(session));
    mocks.createDatasetData.mockResolvedValue({ insertId, tokens: 10 });
    mocks.getI18nDatasetType.mockReturnValue('Dataset');
  });

  it('creates the data in a Mongo transaction and forwards the same session', async () => {
    const result = await handler({} as never);

    expect(result).toBe(insertId);
    expect(mocks.mongoSessionRun).toHaveBeenCalledTimes(1);
    expect(mocks.createDatasetData).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-id',
        tmbId: 'tmb-id',
        datasetId,
        collectionId,
        q: 'question',
        a: 'answer',
        indexPrefix: '# Collection',
        embeddingModel: embeddingModelData,
        imageIndex: true,
        metadata: { source: 'manual' },
        session
      })
    );
    expect(mocks.pushGenerateVectorUsage).toHaveBeenCalledWith({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      inputTokens: 10,
      model: embeddingModelData
    });
  });

  it('does not record usage when the transactional create fails', async () => {
    const error = new Error('create failed');
    mocks.createDatasetData.mockRejectedValue(error);

    await expect(handler({} as never)).rejects.toBe(error);

    expect(mocks.mongoSessionRun).toHaveBeenCalledTimes(1);
    expect(mocks.pushGenerateVectorUsage).not.toHaveBeenCalled();
    expect(mocks.addAuditLog).not.toHaveBeenCalled();
  });
});
