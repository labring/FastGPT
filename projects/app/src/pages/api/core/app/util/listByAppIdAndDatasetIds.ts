import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';

export type ListByAppIdAndDatasetIdsBody = {
  appId: string;
  datasetIdList: string[];
};

export async function listByAppIdAndDatasetIds({
  appId,
  datasetIdList
}: ListByAppIdAndDatasetIdsBody) {
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new Error('App not found');
  }
  const { teamId } = app;

  const myDatasets = await MongoDataset.find({
    teamId,
    _id: { $in: datasetIdList },
    type: { $ne: DatasetTypeEnum.folder }
  }).lean();

  return myDatasets.map((item) => ({
    datasetId: item._id,
    avatar: item.avatar,
    name: item.name,
    vectorModel: getEmbeddingModel(item.vectorModel)
  }));
}
