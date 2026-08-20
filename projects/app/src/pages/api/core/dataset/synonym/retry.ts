import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  DatasetSynonymJobActionBodySchema,
  DatasetSynonymMutationResponseSchema,
  type DatasetSynonymMutationResponse
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  DatasetSynonymJobStatusEnum,
  DatasetSynonymJobTypeEnum
} from '@fastgpt/global/core/dataset/synonym';
import { MongoDatasetSynonymJob } from '@fastgpt/service/core/dataset/synonym/schema';
import {
  createDatasetSynonymVersion,
  processDatasetSynonymMarkingJob
} from '@fastgpt/service/core/dataset/synonym/controller';
import { getDatasetSynonymMappings } from '@fastgpt/service/core/dataset/synonym/entity';

async function handler(req: ApiRequestProps): Promise<DatasetSynonymMutationResponse> {
  const { jobId } = parseApiInput({ req, bodySchema: DatasetSynonymJobActionBodySchema }).body;
  const job = await MongoDatasetSynonymJob.findById(jobId).lean();
  if (!job || job.status !== DatasetSynonymJobStatusEnum.failed || job.snapshotReady !== true) {
    throw new Error('仅失败的同义词任务可以重试');
  }
  const datasetId = String(job.datasetId);
  const { teamId, tmbId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });
  if (String(job.teamId) !== teamId) throw new Error('无权重试该同义词任务');

  const versionMappings = await getDatasetSynonymMappings({
    teamId,
    datasetId,
    fileVersion: job.fileVersion
  });
  if (job.type !== DatasetSynonymJobTypeEnum.delete && versionMappings.length === 0) {
    throw new Error('失败任务的 Mongo mapping 快照不存在，无法重试');
  }
  const result = await createDatasetSynonymVersion({
    teamId,
    tmbId,
    datasetId,
    billId: String(job.billId),
    mappings: versionMappings.map((mapping, index) => ({
      standardizedTerm: mapping.standardizedTerm,
      normalizedStandardizedTerm: mapping.normalizedStandardizedTerm,
      synonymTerms: mapping.synonymTerms,
      normalizedSynonymTerms: mapping.normalizedSynonymTerms,
      allTerms: mapping.allTerms,
      fingerprint: mapping.fingerprint,
      sourceRows: [index + 1]
    })),
    file:
      job.type !== DatasetSynonymJobTypeEnum.delete
        ? {
            fileName: job.fileName ?? 'synonyms.csv',
            size: job.size ?? 0,
            uploadTime: new Date()
          }
        : undefined,
    type: job.type
  });
  void processDatasetSynonymMarkingJob(result.jobId);
  return DatasetSynonymMutationResponseSchema.parse(result);
}

export default NextAPI(handler);
