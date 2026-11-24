import { NextAPI } from '@/service/middleware/entry';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
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

  /** 详情接口的旧字段从当前 K 上限投影，供 4.17.5 客户端按 M Tokens 读取。 */
  const toPublicLLMModel = (model: LLMModelDataType | undefined) => {
    if (!model) return;
    const publicModel = desensitizeModel(model);
    const tiers = publicModel.pricing?.tiers;
    if (!tiers) return publicModel;

    return {
      ...publicModel,
      pricing: {
        ...publicModel.pricing,
        tiers: tiers.map((tier) =>
          tier.maxInputTokensK === undefined
            ? tier
            : { ...tier, maxInputTokens: tier.maxInputTokensK / 1000 }
        )
      }
    };
  };

  return GetDatasetDetailResponseSchema.parse({
    ...dataset,
    status,
    hasTrainingTask,
    errorMsg,
    permission,
    vectorModel: vectorModel ? desensitizeModel(vectorModel) : undefined,
    agentModel: toPublicLLMModel(agentModel),
    vlmModel: toPublicLLMModel(vlmModel),
    apiDatasetServer: filterApiDatasetServerPublicData(dataset.apiDatasetServer)
  });
}

export default NextAPI(handler);
