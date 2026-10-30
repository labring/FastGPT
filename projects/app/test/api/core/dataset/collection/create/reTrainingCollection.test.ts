import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

const {
  mockAuthDatasetCollection,
  mockCreateCollectionAndInsertData,
  mockDelCollection,
  mockMongoSessionRun,
  mockCollectionTagsToTagLabel,
  mockAddAuditLog,
  mockGetCollectionCollaborators,
  mockCarryOverCollectionPermission,
  mockGetDatasetModelAuthContext,
  modelAuthContext
} = vi.hoisted(() => ({
  mockAuthDatasetCollection: vi.fn(),
  mockCreateCollectionAndInsertData: vi.fn(),
  mockDelCollection: vi.fn(),
  mockMongoSessionRun: vi.fn((fn: (session: string) => unknown) => fn('session')),
  mockCollectionTagsToTagLabel: vi.fn(),
  mockAddAuditLog: vi.fn(),
  mockGetCollectionCollaborators: vi.fn(),
  mockCarryOverCollectionPermission: vi.fn(),
  mockGetDatasetModelAuthContext: vi.fn(),
  modelAuthContext: { modelHandle: {}, authorizedIds: new Set<string>() }
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: mockAuthDatasetCollection
}));

vi.mock('@/service/core/dataset/collection/auth', () => ({
  getDatasetModelAuthContext: mockGetDatasetModelAuthContext
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createCollectionAndInsertData: mockCreateCollectionAndInsertData,
  delCollection: mockDelCollection
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mockMongoSessionRun
}));

vi.mock('@fastgpt/service/core/dataset/collection/utils', () => ({
  collectionTagsToTagLabel: mockCollectionTagsToTagLabel
}));

vi.mock('@fastgpt/service/support/permission/collection/collaborator', () => ({
  getCollectionCollaborators: mockGetCollectionCollaborators
}));

vi.mock('@fastgpt/service/support/permission/collection/controller', () => ({
  carryOverCollectionPermission: mockCarryOverCollectionPermission
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: mockAddAuditLog,
  getI18nDatasetType: vi.fn((type: string) => type)
}));

import handler from '@/pages/api/core/dataset/collection/create/reTrainingCollection';

const sourceDatasetId = '507f1f77bcf86cd799439011';
const sourceCollectionId = '507f1f77bcf86cd799439012';
const newCollectionId = '507f1f77bcf86cd799439013';
const foreignDatasetId = '507f1f77bcf86cd799439014';

const sourceCollection = {
  _id: sourceCollectionId,
  teamId: 'team-b',
  tmbId: 'tmb-b',
  datasetId: sourceDatasetId,
  parentId: null,
  name: 'source collection',
  type: DatasetCollectionTypeEnum.file,
  tags: ['tag-id'],
  dataset: {
    _id: sourceDatasetId,
    teamId: 'team-b',
    name: 'source dataset',
    type: 'dataset',
    vectorModel: 'text-embedding-3-small',
    agentModel: 'gpt-4o-mini'
  }
};

describe('reTrainingCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollectionTagsToTagLabel.mockResolvedValue(['tag-label']);
    mockGetCollectionCollaborators.mockResolvedValue([]);
    mockCarryOverCollectionPermission.mockResolvedValue(undefined);
    mockCreateCollectionAndInsertData.mockResolvedValue({
      collectionId: newCollectionId,
      results: { insertLen: 0 }
    });
    mockGetDatasetModelAuthContext.mockResolvedValue(modelAuthContext);
    mockAuthDatasetCollection.mockResolvedValue({
      collection: sourceCollection,
      teamId: 'team-b',
      tmbId: 'tmb-b',
      isRoot: false
    });
  });

  it('uses server-owned collection ownership fields when recreating a collection', async () => {
    await handler(
      {
        body: {
          collectionId: sourceCollectionId,
          datasetId: foreignDatasetId,
          chunkSize: 800
        }
      } as any,
      {} as Parameters<typeof handler>[1]
    );

    expect(mockCreateCollectionAndInsertData).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: sourceCollection.dataset,
        modelAuthContext,
        createCollectionParams: expect.objectContaining({
          datasetId: sourceDatasetId,
          teamId: 'team-b',
          tmbId: 'tmb-b',
          chunkSize: 800,
          tags: ['tag-label']
        })
      })
    );
  });

  it('ignores legacy datasetId in the request body', async () => {
    await handler(
      {
        body: {
          collectionId: sourceCollectionId,
          datasetId: foreignDatasetId
        }
      } as any,
      {} as Parameters<typeof handler>[1]
    );

    expect(mockCreateCollectionAndInsertData).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: sourceCollection.dataset,
        modelAuthContext,
        createCollectionParams: expect.objectContaining({
          datasetId: sourceDatasetId,
          teamId: 'team-b',
          tmbId: 'tmb-b'
        })
      })
    );
  });

  it('denies unauthorized embedding before opening the retrain transaction', async () => {
    const error = new Error('embedding model is not authorized');
    mockGetDatasetModelAuthContext.mockRejectedValueOnce(error);

    await expect(
      handler(
        { body: { collectionId: sourceCollectionId } } as any,
        {} as Parameters<typeof handler>[1]
      )
    ).rejects.toBe(error);

    expect(mockMongoSessionRun).not.toHaveBeenCalled();
    expect(mockDelCollection).not.toHaveBeenCalled();
  });
});
