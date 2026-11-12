import handler from '@/pages/api/core/dataset/collection/sync';
import {
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSyncCollection, mockEnqueue } = vi.hoisted(() => ({
  mockSyncCollection: vi.fn(),
  mockEnqueue: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/collection/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/collection/utils')>()),
  syncCollection: mockSyncCollection
}));
vi.mock('@fastgpt/service/core/dataset/datasetPermissionSync', () => ({
  enqueueDatasetPermissionSync: mockEnqueue
}));

/** 建一个带指定 apiDatasetServer 的知识库 + 直属于它的 collection。 */
const createDatasetAndCollection = async ({
  apiFileId,
  apiDatasetServer
}: {
  apiFileId?: string;
  apiDatasetServer?: Record<string, unknown>;
}) => {
  const users = await getFakeUsers(1);
  const dataset = await MongoDataset.create({
    name: 'sync-dataset',
    type: DatasetTypeEnum.dataset,
    teamId: users.owner.teamId,
    tmbId: users.owner.tmbId,
    vectorModelId: 'test-model',
    apiDatasetServer
  });
  const collection = await MongoDatasetCollection.create({
    name: 'sync-collection',
    type: apiFileId ? DatasetCollectionTypeEnum.apiFile : DatasetCollectionTypeEnum.link,
    teamId: users.owner.teamId,
    tmbId: users.owner.tmbId,
    datasetId: dataset._id,
    apiFileId
  });

  return { users, dataset, collection };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSyncCollection.mockResolvedValue(DatasetCollectionSyncResultEnum.success);
  mockEnqueue.mockResolvedValue(undefined);
});

describe('collection sync api', () => {
  it('enqueues a targeted permission sync for an api file when permission sync is on', async () => {
    const { users, dataset, collection } = await createDatasetAndCollection({
      apiFileId: 'file-1',
      apiDatasetServer: { permissionSync: true, apiServer: { baseUrl: 'https://example.com' } }
    });

    const res = await Call(handler, {
      auth: users.owner,
      body: { collectionId: String(collection._id) }
    });

    expect(res.code).toBe(200);
    // 根 = 该文件当前的 collection 行；入队失败不影响内容同步结果
    expect(mockEnqueue).toHaveBeenCalledWith({
      datasetId: String(dataset._id),
      collectionIds: [String(collection._id)]
    });
  });

  it('does not enqueue when permission sync is off', async () => {
    const { users, collection } = await createDatasetAndCollection({
      apiFileId: 'file-1',
      apiDatasetServer: { apiServer: { baseUrl: 'https://example.com' } }
    });

    const res = await Call(handler, {
      auth: users.owner,
      body: { collectionId: String(collection._id) }
    });

    expect(res.code).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue for a link collection without an external source', async () => {
    const { users, collection } = await createDatasetAndCollection({
      apiDatasetServer: { permissionSync: true, apiServer: { baseUrl: 'https://example.com' } }
    });

    const res = await Call(handler, {
      auth: users.owner,
      body: { collectionId: String(collection._id) }
    });

    expect(res.code).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
