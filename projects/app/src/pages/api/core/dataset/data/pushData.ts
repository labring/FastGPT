/* push data to training queue */
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  PushDataBodySchema,
  type PushDataResponseType
} from '@fastgpt/global/openapi/core/dataset/data/api';

async function handler(req: ApiRequestProps): Promise<PushDataResponseType> {
  const body = PushDataBodySchema.parse(req.body);
  // Adapter 4.9.0: support legacy trainingMode field
  const rawBody = req.body as { trainingMode?: string };
  if (!body.trainingType && rawBody.trainingMode) {
    body.trainingType = rawBody.trainingMode as any;
  }

  const { collectionId, data } = body;

  // 凭证校验
  const { teamId, tmbId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  const mode = getTrainingModeByCollection(collection);

  // auth dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(mode, data)
  });

  return pushDataListToTrainingQueue({
    ...body,
    mode, // Use collection's training mode
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
