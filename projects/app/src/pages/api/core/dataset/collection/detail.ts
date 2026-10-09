/*
    Get one dataset collection detail
*/
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { getVectorCount } from '@fastgpt/service/common/vectorDB/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { Types } from '@fastgpt/service/common/mongo';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { isAuthorizedDatasetFileS3Key } from '@fastgpt/service/common/s3/sources/dataset/key';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { GetCollectionDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetCollectionDetailQuerySchema,
  GetCollectionDetailResponseSchema
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  getCollectionTrainingStatusFromCounts,
  getCollectionTrainingModeCountsPipeline,
  type CollectionTrainingModeCount
} from '@fastgpt/service/core/dataset/training/query';
import {
  datasetDataRebuildStatusCountFields,
  type DatasetDataRebuildStatusCounts
} from '@fastgpt/service/core/dataset/data/query';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  datasetDataRebuildIndexProcessingStatuses,
  datasetDataRebuildSynonymProcessingStatuses,
  datasetDataRebuildFailedStatuses
} from '@fastgpt/global/core/dataset/data/utils';

/**
 * 获取数据集集合的训练状态统计信息
 * @param teamId - 团队ID
 * @param datasetId - 数据集ID
 * @param collectionId - 集合ID
 * @returns 包含训练数量、活跃训练数、错误数及最慢训练状态的统计对象
 */
const getCollectionTrainingStatus = async ({
  teamId,
  datasetId,
  collectionId
}: {
  teamId: Types.ObjectId;
  datasetId: Types.ObjectId;
  collectionId: Types.ObjectId;
}) => {
  const [[trainingStatus], [dataStatus]] = await Promise.all([
    MongoDatasetTraining.aggregate<{ modeCounts: CollectionTrainingModeCount[] }>(
      getCollectionTrainingModeCountsPipeline({ teamId, datasetId, collectionId }),
      readFromSecondary
    ),
    MongoDatasetData.aggregate<DatasetDataRebuildStatusCounts>(
      [
        {
          $match: {
            teamId,
            datasetId,
            collectionId,
            indexStatus: {
              $in: [
                ...datasetDataRebuildIndexProcessingStatuses,
                ...datasetDataRebuildSynonymProcessingStatuses,
                ...datasetDataRebuildFailedStatuses
              ]
            }
          }
        },
        { $group: { _id: null, ...datasetDataRebuildStatusCountFields } }
      ],
      readFromSecondary
    )
  ]);

  return getCollectionTrainingStatusFromCounts({
    modeCounts: trainingStatus?.modeCounts,
    rebuildCounts: dataStatus
  });
};

async function handler(req: ApiRequestProps): Promise<GetCollectionDetailResponseType> {
  const { id } = parseApiInput({ req, querySchema: GetCollectionDetailQuerySchema }).query;

  // 凭证校验
  const { collection, permission } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: id,
    per: ReadPermissionVal
  });

  const fileId = collection?.fileId;
  // fileId 必须属于集合所属 dataset，否则拒绝读取元数据，避免泄露外库文件的文件名/体积/类型。
  if (
    fileId &&
    (!isS3ObjectKey(fileId, 'dataset') ||
      !isAuthorizedDatasetFileS3Key({ key: fileId, datasetId: collection.datasetId }))
  ) {
    return Promise.reject(CommonErrEnum.unAuthFileKey);
  }

  const [file, indexAmount, trainingStatus] = await Promise.all([
    fileId ? getS3DatasetSource().getFileMetadata(fileId) : undefined,
    getVectorCount({
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      collectionId: collection._id
    }),
    getCollectionTrainingStatus({
      teamId: new Types.ObjectId(collection.teamId),
      datasetId: new Types.ObjectId(collection.datasetId),
      collectionId: new Types.ObjectId(collection._id)
    })
  ]);

  return GetCollectionDetailResponseSchema.parse({
    ...collection,
    indexAmount: indexAmount ?? 0,
    ...getCollectionSourceData(collection),
    tags: await collectionTagsToTagLabel({
      datasetId: collection.datasetId,
      tags: collection.tags
    }),
    permission,
    file,
    ...trainingStatus,
    errorCount: trainingStatus.finalErrorAmount
  });
}

export default NextAPI(handler);
