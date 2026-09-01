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
import {
  findDatasetAgentModel,
  findDatasetEmbeddingModel,
  findDatasetVlmModel
} from '@fastgpt/service/core/dataset/model';

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
  const vectorModel = findDatasetEmbeddingModel(dataset);
  const agentModel = findDatasetAgentModel(dataset);
  const vlmModel = findDatasetVlmModel(dataset);

  return GetDatasetDetailResponseSchema.parse({
    ...dataset,
    status,
    errorMsg,
    permission,
    vectorModel: vectorModel ? desensitizeSystemModel(vectorModel) : undefined,
    agentModel: agentModel ? desensitizeSystemModel(agentModel) : undefined,
    vlmModel: vlmModel ? desensitizeSystemModel(vlmModel) : undefined,
    apiDatasetServer: filterApiDatasetServerPublicData(dataset.apiDatasetServer)
  });
}

export default NextAPI(handler);
