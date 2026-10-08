import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getDatasetIndexTrainingMode } from '@fastgpt/service/core/dataset/training/service';
import {
  UpdateTrainingDataBodySchema,
  UpdateTrainingDataResponseSchema,
  type UpdateTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { finalErrorTrainingMatch } from '@fastgpt/service/core/dataset/training/query';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';

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

    const taskMatch = {
      ...retryMatch,
      ...finalErrorTrainingMatch
    };

    await mongoSessionRun(async (session) => {
      const failedTasks = await MongoDatasetTraining.find(taskMatch, { dataId: 1 })
        .session(session)
        .lean();
      await MongoDatasetTraining.updateMany(
        taskMatch,
        {
          $unset: { errorMsg: '' },
          retryCount: 3,
          lockTime: new Date('2000')
        },
        { session }
      );
      const dataIds = failedTasks.flatMap((task) => (task.dataId ? [task.dataId] : []));
      if (dataIds.length) {
        await MongoDatasetData.updateMany(
          { _id: { $in: dataIds }, indexStatus: DatasetDataIndexStatusEnum.error },
          {
            $set: { indexStatus: DatasetDataIndexStatusEnum.indexing },
            $unset: { indexErrorMsg: '' }
          },
          { session }
        );
      }
    });

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

  // 只有补充图片解析结果才跳过当前阶段；重试 index 必须保留其原阶段。
  const nextMode =
    data.mode === TrainingModeEnum.imageParse && data.imageId && q
      ? await getDatasetIndexTrainingMode(data)
      : undefined;

  await mongoSessionRun(async (session) => {
    if (data.dataId) {
      await MongoDatasetData.updateOne(
        { _id: data.dataId, indexStatus: DatasetDataIndexStatusEnum.error },
        {
          $set: { indexStatus: DatasetDataIndexStatusEnum.indexing },
          $unset: { indexErrorMsg: '' }
        },
        { session }
      );
    }

    await MongoDatasetTraining.updateOne(
      trainingMatch,
      {
        $unset: { errorMsg: '' },
        retryCount: 3,
        ...(nextMode && { mode: nextMode }),
        ...(q !== undefined && { q }),
        ...(a !== undefined && { a }),
        ...(chunkIndex !== undefined && { chunkIndex }),
        lockTime: new Date('2000')
      },
      { session }
    );
  });

  return UpdateTrainingDataResponseSchema.parse(undefined);
}

export default NextAPI(handler);

export { handler };
