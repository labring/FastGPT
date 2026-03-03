import type { NextApiRequest } from 'next';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { type CreateTrainingUsageProps } from '@fastgpt/global/support/wallet/usage/api.d';
import { getLLMModel, getEmbeddingModel, getVlmModel } from '@fastgpt/service/core/ai/model';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest) {
  const { name, datasetId } = req.body as CreateTrainingUsageProps;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  const { usageId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: name,
    billSource: UsageSourceEnum.training,
    vectorModel: getEmbeddingModel(dataset.vectorModel).name,
    agentModel: getLLMModel(dataset.agentModel).name,
    vllmModel: getVlmModel(dataset.vlmModel)?.name
  });

  return usageId;
}

export default NextAPI(handler);
