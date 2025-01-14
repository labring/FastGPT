import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

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

  return {
    ...dataset,
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
    vectorModel: getVectorModel(dataset.vectorModel),
    agentModel: getLLMModel(dataset.agentModel)
  };
}

export default NextAPI(handler);
