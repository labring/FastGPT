import { deleteDatasetData } from '@/service/core/dataset/data/data';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteTrainingDataBodySchema,
  DeleteTrainingDataResponseSchema,
  type DeleteTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';

/** 删除训练任务；重建任务同时删除原始数据及其索引，首次训练维持原有取消行为。 */
async function handler(req: ApiRequestProps): Promise<DeleteTrainingDataResponse> {
  const { collectionId, dataId } = parseApiInput({
    req,
    bodySchema: DeleteTrainingDataBodySchema
  }).body;

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ManagePermissionVal
  });

  const trainingMatch = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id,
    _id: dataId
  };
  await mongoSessionRun(async (session) => {
    const training = await MongoDatasetTraining.findOne(trainingMatch).session(session);
    if (!training) return;

    if (
      [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym].includes(training.mode) &&
      training.dataId
    ) {
      // 关联数据必须属于已鉴权集合；读取和删除共用事务，避免工作线程完成提交后误用旧索引。
      const data = await MongoDatasetData.findOne({
        _id: training.dataId,
        teamId: collection.teamId,
        datasetId: collection.datasetId,
        collectionId: collection._id
      })
        .session(session)
        .lean();
      if (data) {
        await deleteDatasetData(
          {
            ...data,
            id: String(data._id)
          },
          session
        );
      }
      await MongoDatasetTraining.deleteOne(trainingMatch, { session });
      return;
    }

    if (training.dataId) {
      await MongoDatasetData.updateOne(
        {
          _id: training.dataId,
          teamId: collection.teamId,
          datasetId: collection.datasetId,
          collectionId: collection._id,
          indexStatus: DatasetDataIndexStatusEnum.indexing
        },
        {
          $set: {
            indexStatus: DatasetDataIndexStatusEnum.error,
            indexErrorMsg: 'Training task deleted'
          }
        },
        { session }
      );
    }

    await MongoDatasetTraining.deleteOne(trainingMatch, { session });
  });

  return DeleteTrainingDataResponseSchema.parse(undefined);
}

export default NextAPI(handler);
export type deleteTrainingDataBody =
  import('@fastgpt/global/openapi/core/dataset/training/api').DeleteTrainingDataBody;
export type deleteTrainingDataResponse = DeleteTrainingDataResponse;
