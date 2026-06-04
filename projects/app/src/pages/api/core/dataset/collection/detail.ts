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
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { GetCollectionDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetCollectionDetailQuerySchema,
  GetCollectionDetailResponseSchema
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  activeTrainingExpr,
  finalErrorTrainingExpr,
  getSlowestTrainingStatus,
  remainingTrainingMatch,
  trainingModeRanks
} from '@fastgpt/service/core/dataset/training/query';
import { CollectionTrainingStatusEnum } from '@fastgpt/global/core/dataset/constants';

const defaultCollectionTrainingStatus = {
  trainingAmount: 0,
  activeTrainingAmount: 0,
  finalErrorAmount: 0,
  hasError: false,
  slowestTrainingStatus: CollectionTrainingStatusEnum.ready
};

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
  const [trainingStatus] = await MongoDatasetTraining.aggregate(
    [
      {
        $match: {
          teamId,
          datasetId,
          collectionId,
          ...remainingTrainingMatch
        }
      },
      {
        $addFields: {
          modeRank: {
            $switch: {
              branches: trainingModeRanks.map(({ mode, rank }) => ({
                case: { $eq: ['$mode', mode] },
                then: rank
              })),
              default: 999
            }
          },
          isActiveTraining: activeTrainingExpr,
          isFinalErrorTraining: finalErrorTrainingExpr
        }
      },
      {
        $group: {
          _id: '$mode',
          modeRank: { $first: '$modeRank' },
          activeCount: { $sum: { $cond: ['$isActiveTraining', 1, 0] } },
          finalErrorCount: { $sum: { $cond: ['$isFinalErrorTraining', 1, 0] } },
          trainingAmount: { $sum: 1 }
        }
      },
      {
        $sort: {
          modeRank: 1
        }
      },
      {
        $group: {
          _id: null,
          trainingAmount: { $sum: '$trainingAmount' },
          activeTrainingAmount: { $sum: '$activeCount' },
          finalErrorAmount: { $sum: '$finalErrorCount' },
          modeCounts: {
            $push: {
              mode: '$_id',
              activeCount: '$activeCount',
              finalErrorCount: '$finalErrorCount'
            }
          }
        }
      }
    ],
    readFromSecondary
  );

  if (!trainingStatus) return defaultCollectionTrainingStatus;

  const { slowestTrainingMode, slowestTrainingStatus } = getSlowestTrainingStatus(
    Object.fromEntries(
      trainingStatus.modeCounts.map(
        ({
          mode,
          activeCount,
          finalErrorCount
        }: {
          mode: any;
          activeCount: number;
          finalErrorCount: number;
        }) => [mode, { activeCount, finalErrorCount }]
      )
    )
  );

  return {
    trainingAmount: trainingStatus.trainingAmount,
    activeTrainingAmount: trainingStatus.activeTrainingAmount,
    finalErrorAmount: trainingStatus.finalErrorAmount,
    hasError: trainingStatus.finalErrorAmount > 0,
    slowestTrainingMode,
    slowestTrainingStatus
  };
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
  if (fileId && !isS3ObjectKey(fileId, 'dataset')) {
    return Promise.reject('Invalid dataset file key');
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
