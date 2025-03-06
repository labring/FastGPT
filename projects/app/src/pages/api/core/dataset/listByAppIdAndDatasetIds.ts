import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { NextAPI } from '@/service/middleware/entry';
export type ListByAppIdAndDatasetIdsBody = {
  appId: string;
  datasetIdList: string[];
};

async function handler(req: ApiRequestProps<ListByAppIdAndDatasetIdsBody>) {
  const { appId, datasetIdList } = req.body;

  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    return Promise.reject('App not found');
  }
  const { teamId } = app;

  const myDatasets = await MongoDataset.find({
    teamId,
    _id: { $in: datasetIdList },
    type: { $ne: DatasetTypeEnum.folder }
  }).lean();

  return myDatasets.map((item) => ({
    _id: item._id,
    avatar: item.avatar,
    name: item.name,
    vectorModel: getEmbeddingModel(item.vectorModel)
  }));
}

export default NextAPI(handler);
