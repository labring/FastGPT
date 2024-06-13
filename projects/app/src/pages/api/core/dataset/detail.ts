import type { NextApiRequest, NextApiResponse } from 'next';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { id: datasetId } = req.query as {
    id: string;
  };

  if (!datasetId) {
    throw new Error('缺少参数');
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
    vectorModel: getVectorModel(dataset.vectorModel),
    agentModel: getLLMModel(dataset.agentModel),
    canWrite: permission.hasWritePer,
    isOwner: permission.isOwner
  };
}

export default NextAPI(handler);
