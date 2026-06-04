import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  UpdateTrainingDataBodySchema,
  UpdateTrainingDataResponseSchema,
  type UpdateTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { finalErrorTrainingMatch } from '@fastgpt/service/core/dataset/training/query';

async function handler(req: ApiRequestProps): Promise<UpdateTrainingDataResponse> {
  const body = parseApiInput({ req, bodySchema: UpdateTrainingDataBodySchema }).body;

  // 不传 dataId 时是批量重试：collectionId 和 datasetId 分别限定不同的重试范围。
  if (!body.dataId) {
    const retryMatch = await (async () => {
      if (body.collectionId) {
        const { collection } = await authDatasetCollection({
          req,
          authToken: true,
          authApiKey: true,
          collectionId: body.collectionId,
          per: WritePermissionVal
        });

        return {
          teamId: collection.teamId,
          datasetId: collection.datasetId,
          collectionId: collection._id
        };
      }

      const { teamId, dataset } = await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        datasetId: body.datasetId!,
        per: WritePermissionVal
      });

      return {
        teamId,
        datasetId: dataset._id
      };
    })();

    await MongoDatasetTraining.updateMany(
      {
        ...retryMatch,
        ...finalErrorTrainingMatch
      },
      {
        $unset: { errorMsg: '' },
        retryCount: 3,
        lockTime: new Date('2000')
      }
    );
    return UpdateTrainingDataResponseSchema.parse(undefined);
  }

  const { q, a, chunkIndex } = body;
  // 单条重试只信任 dataId 找到的训练记录，再用记录所属 collection 做权限校验。
  const data = await MongoDatasetTraining.findById(body.dataId);

  if (!data) {
    return Promise.reject('data not found');
  }

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: data.collectionId,
    per: WritePermissionVal
  });

  if (
    String(collection.teamId) !== String(data.teamId) ||
    String(collection.datasetId) !== String(data.datasetId) ||
    String(collection._id) !== String(data.collectionId)
  ) {
    return Promise.reject('data not found');
  }

  const trainingMatch = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id,
    _id: data._id
  };

  // Add to chunk
  if (data.imageId && q) {
    await MongoDatasetTraining.updateOne(trainingMatch, {
      $unset: { errorMsg: '' },
      retryCount: 3,
      mode: TrainingModeEnum.chunk,
      ...(q !== undefined && { q }),
      ...(a !== undefined && { a }),
      ...(chunkIndex !== undefined && { chunkIndex }),
      lockTime: new Date('2000')
    });
  } else {
    await MongoDatasetTraining.updateOne(trainingMatch, {
      $unset: { errorMsg: '' },
      retryCount: 3,
      ...(q !== undefined && { q }),
      ...(a !== undefined && { a }),
      ...(chunkIndex !== undefined && { chunkIndex }),
      lockTime: new Date('2000')
    });
  }

  return UpdateTrainingDataResponseSchema.parse(undefined);
}

export default NextAPI(handler);

export { handler };
