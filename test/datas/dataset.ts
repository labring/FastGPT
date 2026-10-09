import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getRootUser } from './users';

/** 创建独立的知识库和集合；返回一致的归属字段，供测试显式构造 data 和 training。 */
export const createDatasetCollectionFixture = async ({
  user
}: { user?: Awaited<ReturnType<typeof getRootUser>> } = {}) => {
  const root = user ?? (await getRootUser());
  const owner = { teamId: root.teamId, tmbId: root.tmbId };
  const dataset = await MongoDataset.create({ ...owner, name: 'test' });
  const collection = await MongoDatasetCollection.create({
    ...owner,
    datasetId: dataset._id,
    name: 'test',
    type: DatasetCollectionTypeEnum.file
  });
  const scope = {
    teamId: String(root.teamId),
    tmbId: String(root.tmbId),
    datasetId: String(dataset._id),
    collectionId: String(collection._id)
  };
  return { root, dataset, collection, scope };
};
