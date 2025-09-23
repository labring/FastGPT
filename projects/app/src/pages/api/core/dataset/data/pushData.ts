/* push data to training queue */
import type { NextApiResponse } from 'next';
import type { PushDatasetDataProps } from '@fastgpt/global/core/dataset/api.d';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps<PushDatasetDataProps>, res: NextApiResponse<any>) {
  const body = req.body;
  // Adapter 4.9.0
  body.trainingType = body.trainingType || body.trainingMode;

  const { collectionId, data } = body;

  if (!collectionId || !Array.isArray(data)) {
    throw new Error('collectionId or data is empty');
  }

  if (data.length > 200) {
    throw new Error('Data is too long, max 200');
  }

  // 凭证校验
  const { teamId, tmbId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  // auth dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(getTrainingModeByCollection(collection), data)
  });

  return pushDataListToTrainingQueue({
    ...body,
    teamId,
    tmbId,
    datasetId: collection.datasetId,
    vectorModel: collection.dataset.vectorModel,
    agentModel: collection.dataset.agentModel,
    vlmModel: collection.dataset.vlmModel
  });
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '12mb'
  }
};
