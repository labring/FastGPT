import { getLLMModel, getEmbeddingModel, getVlmModel } from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getCurrentWebsiteSyncJob } from '@fastgpt/service/common/bullmq/queues/websiteSync';
import { DatasetStatusEnum } from '@fastgpt/global/core/dataset/constants';
import { FinishedStates } from '@fastgpt/service/common/bullmq';

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

  let status = DatasetStatusEnum.active;
  const syncJob = await getCurrentWebsiteSyncJob(datasetId);
  if (syncJob) {
    const jobState = await syncJob.getState();
    if (jobState == 'active') {
      status = DatasetStatusEnum.syncing;
    } else if (!(jobState in FinishedStates)) {
      status = DatasetStatusEnum.waiting;
    }
  }

  return {
    ...dataset,
    status,
    apiServer: dataset.apiServer
      ? {
          baseUrl: dataset.apiServer.baseUrl,
          authorization: ''
        }
      : undefined,
    yuqueServer: dataset.yuqueServer
      ? {
          userId: dataset.yuqueServer.userId,
          token: ''
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
