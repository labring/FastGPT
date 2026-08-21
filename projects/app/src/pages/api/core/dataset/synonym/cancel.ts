import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  DatasetSynonymJobActionBodySchema,
  DatasetSynonymJobActionResponseSchema
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoDatasetSynonymJob } from '@fastgpt/service/core/dataset/synonym/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { cancelDatasetSynonymJob } from '@fastgpt/service/core/dataset/synonym/controller';

async function handler(req: ApiRequestProps) {
  const { jobId } = parseApiInput({ req, bodySchema: DatasetSynonymJobActionBodySchema }).body;
  const job = await MongoDatasetSynonymJob.findById(jobId).lean();
  if (!job) throw new Error('同义词任务不存在');
  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: String(job.datasetId),
    per: WritePermissionVal
  });
  if (String(job.teamId) !== teamId) throw new Error('无权取消该同义词任务');
  await cancelDatasetSynonymJob(jobId);
  return DatasetSynonymJobActionResponseSchema.parse(undefined);
}

export default NextAPI(handler);
