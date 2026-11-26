import {
  assertAppDatasetIndexModelsAvailable,
  getAssertedDatasetEmbeddingModel,
  getDatasetModelReference
} from '@fastgpt/service/core/dataset/model';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
/* push data to training queue */
import { NextAPI } from '@/service/middleware/entry';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import {
  PushDataBodySchema,
  PushDataResponseSchema,
  type PushDataResponseType
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { datasetDataDocumentTrainingStatusByMode } from '@fastgpt/global/core/dataset/data/utils';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import {
  appendDatasetIndexTraining,
  appendDatasetQaTraining
} from '@fastgpt/service/core/dataset/training/orchestration';
import { enqueueDatasetTrainingBatch } from '@fastgpt/service/core/dataset/training/runtime';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';

import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { isAuthorizedDatasetFileS3Key } from '@fastgpt/service/common/s3/sources/dataset/key';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { normalizeDatasetDataImages } from '@fastgpt/service/core/dataset/data/inlineImages/service';

async function handler(req: ApiRequestProps): Promise<PushDataResponseType> {
  const body = parseApiInput({ req, bodySchema: PushDataBodySchema }).body;
  // Adapter 4.9.0: support legacy trainingMode field
  body.trainingType = body.trainingType || body.trainingMode;

  const { collectionId, billId, data } = body;

  // 凭证校验
  const { teamId, tmbId, isRoot, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });
  const modelHandle = await getTeamModelHandle({ teamId });
  const authorizedIds = await getAuthorizedModelIds({
    actor: { teamId, tmbId, isRoot },
    handle: modelHandle
  });
  const embeddingModels = await assertAppDatasetIndexModelsAvailable({
    resources: [{ type: 'dataset', id: String(collection.datasetId) }],
    teamId,
    modelHandle,
    authorizedIds
  });
  const vectorModelData = getAssertedDatasetEmbeddingModel(
    embeddingModels,
    String(collection.datasetId)
  );
  const agentModelData = modelHandle.getModelData(
    getDatasetModelReference(collection.dataset, 'agent'),
    { type: 'llm' }
  );
  const vlmModelData = modelHandle.getModelData(
    getDatasetModelReference(collection.dataset, 'vlm'),
    { type: 'llm', vision: true, optional: true }
  );

  const { supportImageIndex, supportImageEmbedding } = getDatasetImageIndexCapability({
    vectorModel: vectorModelData,
    vlmModel: vlmModelData
  });
  const mode = getTrainingModeByCollection({
    ...collection,
    ...(body.trainingType && { trainingType: body.trainingType }),
    ...(body.autoIndexes !== undefined && { autoIndexes: body.autoIndexes }),
    ...(body.imageIndex !== undefined && { imageIndex: body.imageIndex }),
    supportImageIndex
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

  // 外部上传不进入可重试事务，替换后正文才参与长度过滤和实际训练。
  const normalized = await normalizeDatasetDataImages({
    teamId: String(teamId),
    datasetId: String(collection.datasetId),
    collectionId,
    data
  });

  const trainingInput = {
    teamId,
    tmbId,
    datasetId: String(collection.datasetId),
    collectionId,
    data: normalized.data,
    ...(normalized.imageUploadKeys.length > 0 && { imageUploadKeys: normalized.imageUploadKeys }),
    billId,
    vectorModelId: vectorModelData.modelId!,
    agentModelId: agentModelData.modelId,
    vlmModelId: vlmModelData?.modelId
  };
  const { insertLen, dataIds } = await (async () => {
    if (mode === TrainingModeEnum.qa) {
      return appendDatasetQaTraining({ ...trainingInput, agentModel: agentModelData });
    }
    const indexStatus = datasetDataDocumentTrainingStatusByMode[mode];
    if (!indexStatus) throw new Error(`Unsupported dataset append training mode: ${mode}`);

    return appendDatasetIndexTraining({
      ...trainingInput,
      indexStatus,
      indexSize: body.indexSize,
      agentModel: agentModelData,
      vlmModel: vlmModelData,
      supportImageEmbedding
    });
  })();

  if (insertLen > 0) {
    await enqueueDatasetTrainingBatch({ collectionIds: [collectionId], teamId });
  }

  return PushDataResponseSchema.parse({ insertLen, dataIds });
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
