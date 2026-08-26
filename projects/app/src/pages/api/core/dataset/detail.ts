import {
  getLLMModelData,
  getEmbeddingModelData,
  getOptionalVlmModelData
} from '@fastgpt/service/core/ai/model';
import { desensitizeSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetDatasetDetailResponseSchema,
  GetDatasetDetailQuerySchema,
  type GetDatasetDetailResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { getDatasetSyncDatasetStatus } from '@fastgpt/service/core/dataset/datasetSync';
import { filterApiDatasetServerPublicData } from '@fastgpt/global/core/dataset/apiDataset/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<GetDatasetDetailResponse> {
  const { id: datasetId } = parseApiInput({ req, querySchema: GetDatasetDetailQuerySchema }).query;

  // 凭证校验
  const { dataset, permission } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const { status, errorMsg } = await getDatasetSyncDatasetStatus(datasetId);
  const vlmModel = getOptionalVlmModelData({
    modelId: dataset.vlmModelId,
    model: dataset.vlmModel
  });

  return GetDatasetDetailResponseSchema.parse({
    ...dataset,
    status,
    errorMsg,
    permission,
    vectorModel: desensitizeSystemModel(
      getEmbeddingModelData({ modelId: dataset.vectorModelId, model: dataset.vectorModel })
    ),
    agentModel: desensitizeSystemModel(
      getLLMModelData({ modelId: dataset.agentModelId, model: dataset.agentModel })
    ),
    vlmModel: vlmModel ? desensitizeSystemModel(vlmModel) : undefined,
    apiDatasetServer: filterApiDatasetServerPublicData(dataset.apiDatasetServer)
  });
}

export default NextAPI(handler);
