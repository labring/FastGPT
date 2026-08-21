import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteDatasetSynonymQuerySchema,
  DeleteDatasetSynonymResponseSchema,
  type DeleteDatasetSynonymResponse
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import { DatasetSynonymJobTypeEnum } from '@fastgpt/global/core/dataset/synonym';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { assertDatasetSynonymConfigMigrated } from '@fastgpt/service/core/dataset/synonym/entity';
import {
  createDatasetSynonymVersion,
  processDatasetSynonymMarkingJob
} from '@fastgpt/service/core/dataset/synonym/controller';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';

async function handler(req: ApiRequestProps): Promise<DeleteDatasetSynonymResponse> {
  const { id } = parseApiInput({ req, querySchema: DeleteDatasetSynonymQuerySchema }).query;
  const config = await MongoDatasetSynonym.findById(id).lean();
  assertDatasetSynonymConfigMigrated(config);
  if (!config) throw new Error('同义词配置不存在');
  const datasetId = String(config.datasetId);
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });
  if (String(config.teamId) !== teamId) throw new Error('无权删除该同义词配置');
  const { usageId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: `${dataset.name}-同义词恢复`,
    billSource: UsageSourceEnum.training,
    vectorModel: getEmbeddingModel(dataset.vectorModel).name
  });
  const result = await createDatasetSynonymVersion({
    teamId,
    tmbId,
    datasetId,
    billId: String(usageId),
    mappings: [],
    expectedSynonymId: id,
    type: DatasetSynonymJobTypeEnum.delete
  });
  void processDatasetSynonymMarkingJob(result.jobId);
  return DeleteDatasetSynonymResponseSchema.parse(result);
}

export default NextAPI(handler);
