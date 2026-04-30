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
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { getVlmModel } from '@fastgpt/service/core/ai/model';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';

async function handler(req: ApiRequestProps): Promise<PushDataResponseType> {
  const body = PushDataBodySchema.parse(req.body);
  // Adapter 4.9.0: support legacy trainingMode field
  body.trainingType = body.trainingType || body.trainingMode;

  const { collectionId, billId, data } = body;

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

  return mongoSessionRun(async (session) => {
    const traingUsageId = await (async () => {
      if (billId) return billId;
      const { usageId: newUsageId } = await createTrainingUsage({
        teamId,
        tmbId,
        appName: collection.name,
        billSource: UsageSourceEnum.training,
        vectorModel: getEmbeddingModel(collection.dataset.vectorModel)?.name,
        agentModel: getLLMModel(collection.dataset.agentModel)?.name,
        vllmModel: getVlmModel(collection.dataset.vlmModel)?.name,
        session
      });
      return newUsageId;
    })();

    return pushDataListToTrainingQueue({
      ...body,
      session,
      billId: traingUsageId,
      mode, // Use collection's training mode
      teamId,
      tmbId,
      datasetId: collection.datasetId,
      vectorModel: collection.dataset.vectorModel,
      agentModel: collection.dataset.agentModel,
      vlmModel: collection.dataset.vlmModel
    });
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
