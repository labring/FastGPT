import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
/* push data to training queue */
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import {
  preCreateDatasetDataAndPushToTrainingQueue,
  pushDataListToTrainingQueue
} from '@fastgpt/service/core/dataset/training/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  PushDataBodySchema,
  type PushDataResponseType
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { isAuthorizedDatasetFileS3Key } from '@fastgpt/service/common/s3/sources/dataset/key';

async function handler(req: ApiRequestProps): Promise<PushDataResponseType> {
  const body = parseApiInput({ req, bodySchema: PushDataBodySchema }).body;
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
  const modelHandle = await getModelHandle({ teamId });
  const vectorModelData = modelHandle.getEmbeddingModelData(
    getDatasetModelReference(collection.dataset, 'embedding')
  );
  const agentModelData = modelHandle.getLLMModelData(
    getDatasetModelReference(collection.dataset, 'agent')
  );
  const vlmModelData = modelHandle.getVlmModelData(
    getDatasetModelReference(collection.dataset, 'vlm'),
    { optional: true }
  );

  const mode = getTrainingModeByCollection({
    ...collection,
    ...(body.trainingType && { trainingType: body.trainingType }),
    ...(body.autoIndexes !== undefined && { autoIndexes: body.autoIndexes }),
    ...(body.imageIndex !== undefined && { imageIndex: body.imageIndex }),
    supportImageIndex: getDatasetImageIndexCapability({
      vectorModel: vectorModelData,
      vlmModel: vlmModelData
    }).supportImageIndex
  });

  // auth dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(mode, data)
  });

  // imageId 一旦提供，就必须归属于当前已鉴权 collection 的 dataset，避免其他来源的 key 进入训练队列
  const hasInvalidImageKey = data.some(
    ({ imageId }) =>
      imageId !== undefined &&
      !isAuthorizedDatasetFileS3Key({ key: imageId, datasetId: collection.datasetId })
  );
  if (hasInvalidImageKey) {
    return Promise.reject(CommonErrEnum.unAuthFileKey);
  }

  return mongoSessionRun(async (session) => {
    const traingUsageId = await (async () => {
      if (billId) return billId;
      const { usageId: newUsageId } = await createTrainingUsage({
        teamId,
        tmbId,
        appName: collection.name,
        billSource: UsageSourceEnum.training,
        vectorModelId: vectorModelData.modelId!,
        agentModelId: agentModelData.modelId,
        vllmModelId: vlmModelData?.modelId,
        session
      });
      return newUsageId;
    })();

    if (mode === TrainingModeEnum.qa) {
      return pushDataListToTrainingQueue({
        ...body,
        session,
        billId: traingUsageId,
        mode,
        teamId,
        tmbId,
        datasetId: collection.datasetId,
        vectorModel: vectorModelData,
        agentModel: agentModelData,
        vlmModel: vlmModelData
      });
    }

    return preCreateDatasetDataAndPushToTrainingQueue({
      ...body,
      session,
      billId: traingUsageId,
      mode, // Use collection's training mode
      teamId,
      tmbId,
      datasetId: collection.datasetId,
      vectorModel: vectorModelData,
      agentModel: agentModelData,
      vlmModel: vlmModelData
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
