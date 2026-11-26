import { NextAPI } from '@/service/middleware/entry';
import { isImageEmbeddingModel } from '@fastgpt/global/core/ai/model/utils';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { switchDatasetEmbeddingModel } from '@fastgpt/service/core/dataset/training/orchestration';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { assertAuthModels } from '@fastgpt/service/support/permission/model/auth';

import {
  RebuildEmbeddingBodySchema,
  RebuildEmbeddingResponseSchema,
  type RebuildEmbeddingResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTrainingAuditModelLabel } from '@fastgpt/service/core/dataset/audit/training';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { buildDatasetAuditResource } from '@fastgpt/global/support/user/audit/type';

async function handler(req: ApiRequestProps): Promise<RebuildEmbeddingResponse> {
  const { datasetId, vectorModelId } = parseApiInput({
    req,
    bodySchema: RebuildEmbeddingBodySchema
  }).body;

  const { teamId, tmbId, isRoot, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });
  const {
    handle: modelHandle,
    models: [vectorModelData]
  } = await assertAuthModels({
    actor: { teamId, tmbId, isRoot },
    modelIds: [vectorModelId],
    type: ModelTypeEnum.embedding
  });

  const oldModelReference = await switchDatasetEmbeddingModel({
    teamId,
    tmbId,
    datasetId,
    vectorModelId: vectorModelData.modelId!,
    supportsImageEmbedding: isImageEmbeddingModel(vectorModelData)
  });

  // 审计复用鉴权时的模型快照，避免重建提交后为日志再次查询目录版本。
  // 名称与稳定 ID 分开保留；旧模型已删除时由保存的引用提供展示兜底。
  {
    const oldModel = getTrainingAuditModelLabel({
      reference: oldModelReference,
      model: modelHandle.findModelData(oldModelReference)
    });
    const newModel = getTrainingAuditModelLabel({
      reference: { modelId: vectorModelData.modelId, model: vectorModelData.model },
      model: vectorModelData
    });
    addAuditLog({
      tmbId,
      teamId,
      event: DatasetAuditEventEnum.DATASET_INDEX_REBUILD,
      resources: [buildDatasetAuditResource(dataset)],
      params: {
        datasetName: dataset.name,
        oldModelName: oldModel.modelName,
        newModelName: newModel.modelName,
        oldModelId: oldModel.modelId,
        newModelId: newModel.modelId
      }
    });
  }

  return RebuildEmbeddingResponseSchema.parse(undefined);
}

export default NextAPI(handler);
