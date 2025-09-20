import { getLLMModel, getEmbeddingModel, getVlmModel } from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { type DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getDatasetSyncDatasetStatus } from '@fastgpt/service/core/dataset/datasetSync';
import { DatasetStatusEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { filterApiDatasetServerPublicData } from '@fastgpt/global/core/dataset/apiDataset/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
type Query = {
  id: string;
};
export type DatasetDetailResponse = DatasetItemType & { tableSchemaDescriptions?: string[] };

// Get table schema descriptions for database datasets
async function getTableSchemaDescriptions(datasetId: string): Promise<string[]> {
  const collections = await MongoDatasetCollection.find({
    datasetId,
    type: DatasetCollectionTypeEnum.table
  })
    .select('tableSchema')
    .lean();

  const descriptions: string[] = [];
  collections.forEach((collection) => {
    if (collection.tableSchema?.description) {
      descriptions.push(collection.tableSchema.description);
    }
  });

  return descriptions;
}

async function handler(req: ApiRequestProps<Query>): Promise<DatasetItemType> {
  const { id: datasetId } = req.query as {
    id: string;
  };

  if (!datasetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { dataset, permission } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const { status, errorMsg } = await getDatasetSyncDatasetStatus(datasetId);

  // Get table schema descriptions for database datasets
  let tableSchemaDescriptions: string[] | undefined;
  if (dataset.type === DatasetTypeEnum.database) {
    tableSchemaDescriptions = await getTableSchemaDescriptions(datasetId);
  }

  const result: DatasetDetailResponse = {
    ...dataset,
    status,
    errorMsg,
    permission,
    vectorModel: getEmbeddingModel(dataset.vectorModel),
    agentModel: getLLMModel(dataset.agentModel),
    vlmModel: getVlmModel(dataset.vlmModel),
    apiDatasetServer: filterApiDatasetServerPublicData(dataset.apiDatasetServer)
  };

  // Add table schema descriptions for database datasets
  if (tableSchemaDescriptions) {
    result.tableSchemaDescriptions = tableSchemaDescriptions;
  }

  return result;
}

export default NextAPI(handler);
