import { describe, expect, it } from 'vitest';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getRootUser } from '@test/datas/users';
import { hasSameValue } from '@/service/core/dataset/data/utils';

const createDatasetContext = async () => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    name: 'test dataset',
    teamId: root.teamId,
    tmbId: root.tmbId,
    type: DatasetTypeEnum.dataset,
    vectorModel: 'text-embedding-3-small',
    agentModel: 'gpt-4o-mini'
  });
  const collection = await MongoDatasetCollection.create({
    name: 'test collection',
    type: DatasetCollectionTypeEnum.file,
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id
  });

  return { root, dataset, collection };
};

describe('hasSameValue', () => {
  it('should resolve when no data has identical q and a in the same collection', async () => {
    const { root, dataset, collection } = await createDatasetContext();

    await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'same question',
      a: 'old answer',
      indexes: []
    });

    await expect(
      hasSameValue({
        teamId: String(root.teamId),
        datasetId: String(dataset._id),
        collectionId: String(collection._id),
        q: 'same question',
        a: 'new answer'
      })
    ).resolves.toBeUndefined();
  });

  it('should reject when identical q and a already exist', async () => {
    const { root, dataset, collection } = await createDatasetContext();

    await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'same question',
      a: '',
      indexes: []
    });

    await expect(
      hasSameValue({
        teamId: String(root.teamId),
        datasetId: String(dataset._id),
        collectionId: String(collection._id),
        q: 'same question'
      })
    ).rejects.toBe('已经存在完全一致的数据');
  });
});
