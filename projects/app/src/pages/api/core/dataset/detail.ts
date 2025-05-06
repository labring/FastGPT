import { getLLMModel, getEmbeddingModel, getVlmModel } from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { type DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getWebsiteSyncDatasetStatus } from '@fastgpt/service/core/dataset/websiteSync';
import { DatasetStatusEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

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

  const { status, errorMsg } = await (async () => {
    if (dataset.type === DatasetTypeEnum.websiteDataset) {
      return await getWebsiteSyncDatasetStatus(datasetId);
    }

    return {
      status: DatasetStatusEnum.active,
      errorMsg: undefined
    };
  })();

  return {
    ...dataset,
    status,
    errorMsg,
    apiServer: dataset.apiServer
      ? {
          baseUrl: dataset.apiServer.baseUrl,
          authorization: ''
        }
      : undefined,
    yuqueServer: dataset.yuqueServer
      ? {
          userId: dataset.yuqueServer.userId,
          token: '',
          basePath: dataset.yuqueServer.basePath
        }
      : undefined,
    feishuServer: dataset.feishuServer
      ? {
          appId: dataset.feishuServer.appId,
          appSecret: '',
          folderToken: dataset.feishuServer.folderToken
        }
      : undefined,
    permission,
    vectorModel: getEmbeddingModel(dataset.vectorModel),
    agentModel: getLLMModel(dataset.agentModel),
    vlmModel: getVlmModel(dataset.vlmModel)
  };
}

export default NextAPI(handler);
