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
          authorization: '',
          basePath: dataset.apiServer.basePath
        }
      : undefined,
    yuqueServer: dataset.yuqueServer
      ? {
          userId: dataset.yuqueServer.userId,
          token: '',
          basePath: dataset.yuqueServer.basePath
        }
      : undefined,
    feishuShareServer: dataset.feishuShareServer
      ? {
          user_access_token: dataset.feishuShareServer.user_access_token,
          refresh_token: dataset.feishuShareServer.refresh_token,
          outdate_time: dataset.feishuShareServer.outdate_time,
          folderToken: dataset.feishuShareServer.folderToken
        }
      : undefined,
    feishuKnowledgeServer: dataset.feishuKnowledgeServer
      ? {
          user_access_token: dataset.feishuKnowledgeServer.user_access_token,
          refresh_token: dataset.feishuKnowledgeServer.refresh_token,
          outdate_time: dataset.feishuKnowledgeServer.outdate_time,
          basePath: dataset.feishuKnowledgeServer.basePath
        }
      : undefined,
    feishuPrivateServer: dataset.feishuPrivateServer
      ? {
          user_access_token: dataset.feishuPrivateServer.user_access_token,
          refresh_token: dataset.feishuPrivateServer.refresh_token,
          outdate_time: dataset.feishuPrivateServer.outdate_time,
          basePath: dataset.feishuPrivateServer.basePath
        }
      : undefined,
    permission,
    vectorModel: getEmbeddingModel(dataset.vectorModel),
    agentModel: getLLMModel(dataset.agentModel),
    vlmModel: getVlmModel(dataset.vlmModel)
  };
}

export default NextAPI(handler);
