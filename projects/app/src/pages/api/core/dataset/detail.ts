import { NextAPI } from '@/service/middleware/entry';
import { filterApiDatasetServerPublicData } from '@fastgpt/global/core/dataset/apiDataset/utils';
import {
  GetDatasetDetailQuerySchema,
  GetDatasetDetailResponseSchema,
  type GetDatasetDetailResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { desensitizeModel } from '@fastgpt/service/core/ai/model/transform';
import { getDatasetSyncDatasetStatus } from '@fastgpt/service/core/dataset/datasetSync';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { hasDatasetTrainingTask } from '@fastgpt/service/core/dataset/training/entity';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

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

  const [{ status, errorMsg }, hasTrainingTask] = await Promise.all([
    getDatasetSyncDatasetStatus(datasetId),
    hasDatasetTrainingTask({ teamId: dataset.teamId, datasetId })
  ]);
  const modelHandle = await getTeamModelHandle({ teamId: String(dataset.teamId) });
  const vectorModel = modelHandle.findModelData(getDatasetModelReference(dataset, 'embedding'), {
    type: 'embedding'
  });
  const agentModel = modelHandle.findModelData(getDatasetModelReference(dataset, 'agent'), {
    type: 'llm'
  });
  const vlmModel = modelHandle.findModelData(getDatasetModelReference(dataset, 'vlm'), {
    type: 'llm',
    vision: true
  });

  return GetDatasetDetailResponseSchema.parse({
    ...dataset,
    status,
    hasTrainingTask,
    errorMsg,
    permission,
    vectorModel: vectorModel ? desensitizeModel(vectorModel) : undefined,
    agentModel: agentModel ? desensitizeModel(agentModel) : undefined,
    vlmModel: vlmModel ? desensitizeModel(vlmModel) : undefined,
    apiDatasetServer: filterApiDatasetServerPublicData(dataset.apiDatasetServer)
  });
}

export default NextAPI(handler);
