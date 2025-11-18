import { getLLMModel, getEmbeddingModel, getVlmModel } from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { type DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getDatasetSyncDatasetStatus } from '@fastgpt/service/core/dataset/datasetSync';
import { filterApiDatasetServerPublicData } from '@fastgpt/global/core/dataset/apiDataset/utils';

type Query = {
  id: string;
};

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

  return {
    ...dataset,
    status,
    errorMsg,
    permission,
    vectorModel: getEmbeddingModel(dataset.vectorModel),
    agentModel: getLLMModel(dataset.agentModel),
    vlmModel: getVlmModel(dataset.vlmModel),
    apiDatasetServer: filterApiDatasetServerPublicData(dataset.apiDatasetServer)
  };
}

export default NextAPI(handler);
