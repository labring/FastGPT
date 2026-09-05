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
    if (training?.dataId && training.synonymVersion) {
      await MongoDatasetData.updateOne(
        {
          _id: training.dataId,
          synonymRebuildingVersion: training.synonymVersion
        },
        { $unset: { synonymRebuildingVersion: '' } },
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
