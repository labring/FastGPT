import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { countDatasetQaTrainingByCollection } from '@fastgpt/service/core/dataset/training/qaSchema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { Types } from '@fastgpt/service/common/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetCollectionTrainingDetailQuerySchema,
  GetCollectionTrainingDetailResponseSchema,
  type GetCollectionTrainingDetailResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  datasetDataRunningRebuildCountFields,
  datasetDataStatusCountFields,
  documentIndexTrainingModes,
  type DatasetDataStatusCounts
} from '@fastgpt/service/core/dataset/data/query';

const defaultCounts: Record<TrainingModeEnum, number> = {
  chunk: 0, // 保留公开接口的阶段键
  parse: 0,
  qa: 0,
  rebuildIndex: 0,
  rebuildSynonym: 0,
  index: 0,
  image: 0,
  auto: 0,
  imageParse: 0
};

/** 汇总各阶段的待处理、重建中和失败数量。 */
async function handler(req: ApiRequestProps): Promise<GetCollectionTrainingDetailResponseType> {
  const { collectionId } = parseApiInput({
    req,
    querySchema: GetCollectionTrainingDetailQuerySchema
  }).query;

  const { collection } = await authDatasetCollection({
    req,
    collectionId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  const match = {
    teamId: new Types.ObjectId(collection.teamId),
    datasetId: new Types.ObjectId(collection.datasetId),
    collectionId: new Types.ObjectId(collection._id)
  };

  const [document, [dataStatus], [qaCounts]] = await Promise.all([
    MongoDatasetCollection.findOne(
      { _id: match.collectionId, teamId: match.teamId, datasetId: match.datasetId },
      { 'training.status': 1, 'training.parse.status': 1 }
    ).lean(),
    MongoDatasetData.aggregate<
      DatasetDataStatusCounts & {
        rebuildIndexRunningCount: number;
        rebuildSynonymRunningCount: number;
      }
    >([
      { $match: match },
      {
        $group: {
          _id: null,
          ...datasetDataStatusCountFields,
          ...datasetDataRunningRebuildCountFields
        }
      }
    ]),
    countDatasetQaTrainingByCollection({
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      collectionIds: [collection._id]
    })
  ]);

  const queuedCounts = { ...defaultCounts };
  const trainingCounts = { ...defaultCounts };
  const errorCounts = { ...defaultCounts };
  // 解析、QA 与首次索引只有待处理状态；重建阶段单独记录已领取。
  const addDocumentCounts = ({
    mode,
    active = 0,
    failed = 0,
    running = 0
  }: {
    mode: TrainingModeEnum;
    active?: number;
    failed?: number;
    running?: number;
  }) => {
    if (document?.training?.status === 'paused_unpaid') {
      errorCounts[mode] = active + failed;
      return;
    }
    queuedCounts[mode] = active - running;
    trainingCounts[mode] = running;
    errorCounts[mode] = failed;
  };
  for (const mode of documentIndexTrainingModes) {
    addDocumentCounts({
      mode,
      active: dataStatus?.[`${mode}ActiveCount`],
      failed: dataStatus?.[`${mode}ErrorCount`]
    });
  }
  addDocumentCounts({
    mode: TrainingModeEnum.qa,
    active: qaCounts?.activeCount,
    failed: qaCounts?.finalErrorCount
  });
  addDocumentCounts({
    mode: TrainingModeEnum.parse,
    active: document?.training?.parse?.status === 'active' ? 1 : 0,
    failed: document?.training?.parse?.status === 'error' ? 1 : 0
  });
  addDocumentCounts({
    mode: TrainingModeEnum.rebuildIndex,
    active: dataStatus?.rebuildIndexActiveCount,
    failed: dataStatus?.rebuildIndexFailedCount,
    running: dataStatus?.rebuildIndexRunningCount
  });
  addDocumentCounts({
    mode: TrainingModeEnum.rebuildSynonym,
    active: dataStatus?.rebuildSynonymActiveCount,
    failed: dataStatus?.rebuildSynonymFailedCount,
    running: dataStatus?.rebuildSynonymRunningCount
  });

  return GetCollectionTrainingDetailResponseSchema.parse({
    trainingType: collection.trainingType,
    advancedTraining: {
      customPdfParse: !!collection.customPdfParse,
      imageIndex: !!collection.imageIndex,
      autoIndexes: !!collection.autoIndexes
    },
    queuedCounts,
    trainingCounts,
    errorCounts,
    trainedCount: dataStatus?.trainedCount ?? 0
  });
}

export default NextAPI(handler);
