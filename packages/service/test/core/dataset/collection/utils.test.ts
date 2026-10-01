import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadDatasetSourceRawText = vi.hoisted(() => vi.fn());
const mockMongoSessionRun = vi.hoisted(() => vi.fn());
const mockDelCollection = vi.hoisted(() => vi.fn());
const mockCreateCollectionAndInsertData = vi.hoisted(() => vi.fn());
const mockGetCollectionCollaborators = vi.hoisted(() => vi.fn());
const mockCarryOverCollectionPermission = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/read', () => ({
  readDatasetSourceRawText: mockReadDatasetSourceRawText
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mockMongoSessionRun
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  delCollection: mockDelCollection,
  createCollectionAndInsertData: mockCreateCollectionAndInsertData
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    updateOne: vi.fn()
  }
}));

// collection 权限快照的留存/写回属于权限层职责，本用例只关心审计任务透传，直接 mock 掉
// 以避免假 id 触发 resource_permissions 的 ObjectId 强转
vi.mock('@fastgpt/service/support/permission/collection/collaborator', () => ({
  getCollectionCollaborators: mockGetCollectionCollaborators
}));

vi.mock('@fastgpt/service/support/permission/collection/controller', () => ({
  carryOverCollectionPermission: mockCarryOverCollectionPermission
}));

vi.mock('@fastgpt/service/core/dataset/tag/schema', () => ({
  MongoDatasetCollectionTags: {}
}));

vi.mock('@fastgpt/service/core/dataset/tag/schemaV2', () => ({
  MongoDatasetCollectionTagsV2: {}
}));

describe('syncCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadDatasetSourceRawText.mockResolvedValue({
      title: 'Updated collection',
      rawText: 'updated content'
    });
    mockMongoSessionRun.mockImplementation((callback) => callback('session'));
    mockDelCollection.mockResolvedValue(undefined);
    mockCreateCollectionAndInsertData.mockResolvedValue({ collectionId: 'new-collection-id' });
    mockGetCollectionCollaborators.mockResolvedValue([]);
    mockCarryOverCollectionPermission.mockResolvedValue(undefined);
  });

  it('associates replacement training with the current sync audit task', async () => {
    const dataset = {
      _id: 'dataset-id',
      teamId: 'team-id',
      tmbId: 'tmb-id'
    };
    const collection = {
      _id: 'collection-id',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      datasetId: 'dataset-id',
      type: 'link',
      name: 'Original collection',
      rawLink: 'https://example.com',
      hashRawText: 'original-hash',
      dataset
    };
    const { syncCollection } = await import('@fastgpt/service/core/dataset/collection/utils');

    await syncCollection(collection as never, 'sync-task-id');

    expect(mockCreateCollectionAndInsertData).toHaveBeenCalledWith(
      expect.objectContaining({
        session: 'session',
        dataset,
        rawText: 'updated content',
        audit: false,
        auditTaskId: 'sync-task-id'
      })
    );
    // 重建后的新 collectionId 必须流向权限快照写回，否则协作者配置会丢失
    expect(mockCarryOverCollectionPermission).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: 'new-collection-id', session: 'session' })
    );
  });
});
