/*
    Get one dataset collection detail
*/
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { getVectorCount } from '@fastgpt/service/common/vectorDB/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { countDatasetQaTrainingByCollection } from '@fastgpt/service/core/dataset/training/qaService';
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
import { getCollectionTrainingStatusFromCounts } from '@fastgpt/service/core/dataset/training/query';
import {
  datasetDataTrainingStatusCountFields,
  datasetDataTrainingStatusMatch,
  type DatasetDataTrainingStatusCounts
} from '@fastgpt/service/core/dataset/data/query';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';

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

  /** 按集合查询解析、QA 和分块状态，再统一计算前端展示的训练进度。 */
  const getCollectionTrainingStatus = async () => {
    const match = {
      teamId: new Types.ObjectId(collection.teamId),
      datasetId: new Types.ObjectId(collection.datasetId),
      collectionId: new Types.ObjectId(collection._id)
    };
    const [document, [dataCounts], [qaCounts]] = await Promise.all([
      MongoDatasetCollection.findOne(
        { _id: match.collectionId, teamId: match.teamId, datasetId: match.datasetId },
        { 'training.parse.status': 1, 'training.status': 1 },
        readFromSecondary
      ).lean(),
      MongoDatasetData.aggregate<DatasetDataTrainingStatusCounts>(
        [
          { $match: { ...match, ...datasetDataTrainingStatusMatch } },
          { $group: { _id: null, ...datasetDataTrainingStatusCountFields } }
        ],
        readFromSecondary
      ),
      countDatasetQaTrainingByCollection({
        teamId: collection.teamId,
        datasetId: collection.datasetId,
        collectionIds: [collection._id],
        useReadReplica: true
      })
    ]);

    return getCollectionTrainingStatusFromCounts({
      dataCounts,
      qaCounts,
      parseStatus: document?.training?.parse?.status,
      pausedUnpaid: document?.training?.status === 'paused_unpaid'
    });
  };

  const [file, indexAmount, trainingStatus] = await Promise.all([
    fileId ? getS3DatasetSource().getFileMetadata(fileId) : undefined,
    getVectorCount({
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      collectionId: collection._id
    }),
    getCollectionTrainingStatus()
  ]);

  return GetCollectionDetailResponseSchema.parse({
    ...collection,
    // 兼容旧层级校正写入的 null；响应仍遵循可选字符串协议。
    apiFileParentId: collection.apiFileParentId ?? undefined,
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
