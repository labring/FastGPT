import syncStateHandler from '@/pages/api/core/dataset/apiDataset/syncState';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('apiDataset syncState', () => {
  it('returns dataset syncAll and local API collection sync states with derived sourceIds', async () => {
    const { owner } = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'api-sync-state',
      type: DatasetTypeEnum.apiDataset,
      syncAll: true,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const folder = await MongoDatasetCollection.create({
      name: 'folder-a',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'dir-a',
      syncChildren: false,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });
    const derived = await MongoDatasetCollection.create({
      name: 'doc-b',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'doc-b#dir',
      metadata: { apiFileSourceId: 'doc-b' },
      parentId: folder._id,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });
    const file = await MongoDatasetCollection.create({
      name: 'doc-b',
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'doc-b',
      parentId: derived._id,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });
    // 手动集合（无 apiFileId）不应出现在返回列表中
    await MongoDatasetCollection.create({
      name: 'manual-file',
      type: DatasetCollectionTypeEnum.file,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });

    const response = await Call(syncStateHandler, {
      auth: owner,
      query: { datasetId: String(dataset._id) }
    });

    expect(response.code).toBe(200);
    expect(response.data.syncAll).toBe(true);
    expect(response.data.collections).toHaveLength(3);
    expect(response.data.collections).toEqual(
      expect.arrayContaining([
        {
          collectionId: String(folder._id),
          apiFileId: 'dir-a',
          sourceId: 'dir-a',
          type: DatasetCollectionTypeEnum.folder,
          syncChildren: false,
          parentId: null
        },
        {
          collectionId: String(derived._id),
          apiFileId: 'doc-b#dir',
          sourceId: 'doc-b',
          type: DatasetCollectionTypeEnum.folder,
          syncChildren: true,
          parentId: String(folder._id)
        },
        {
          collectionId: String(file._id),
          apiFileId: 'doc-b',
          sourceId: 'doc-b',
          type: DatasetCollectionTypeEnum.apiFile,
          syncChildren: true,
          parentId: String(derived._id)
        }
      ])
    );
  });
});
