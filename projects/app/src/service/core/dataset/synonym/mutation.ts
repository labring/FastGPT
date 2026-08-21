import type { ApiRequestProps } from '@fastgpt/next/type';
import path from 'node:path';
import {
  DatasetSynonymJobTypeEnum,
  type NormalizedSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import {
  createDatasetSynonymVersion,
  processDatasetSynonymMarkingJob
} from '@fastgpt/service/core/dataset/synonym/controller';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';

/**
 * 统一创建文件或 JSON mappings 同义词版本。输入在进入此函数前已完成同一套规范化，
 * 这里集中处理权限、账单、首次上传保护和后台 marking 调度。
 */
export const createDatasetSynonymMutation = async ({
  req,
  datasetId,
  mappings,
  fileName,
  size,
  expectedSynonymId,
  type
}: {
  req: ApiRequestProps;
  datasetId: string;
  mappings: NormalizedSynonymMappingType[];
  fileName: string;
  size: number;
  expectedSynonymId?: string;
  type: DatasetSynonymJobTypeEnum.upload | DatasetSynonymJobTypeEnum.update;
}) => {
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  if (type === DatasetSynonymJobTypeEnum.upload) {
    const currentConfig = await MongoDatasetSynonym.findOne({ teamId, datasetId }).lean();
    if (currentConfig?.activeVersion) {
      throw new Error('知识库已配置同义词，请使用更新接口');
    }
  }

  const { usageId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: `${dataset.name}-同义词重建`,
    billSource: UsageSourceEnum.training,
    vectorModel: getEmbeddingModel(dataset.vectorModel).name
  });
  const uploadTime = new Date();
  const safeFileName = path.basename(fileName) || 'synonyms.csv';
  const result = await createDatasetSynonymVersion({
    teamId,
    tmbId,
    datasetId,
    billId: String(usageId),
    mappings,
    file: { fileName: safeFileName, size, uploadTime },
    expectedSynonymId,
    type
  });
  void processDatasetSynonymMarkingJob(result.jobId);
  return result;
};
