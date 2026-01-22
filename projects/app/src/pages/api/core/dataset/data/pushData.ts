/* push data to training queue */
import type { NextApiResponse } from 'next';
import type { PushDatasetDataProps } from '@fastgpt/global/core/dataset/api.d';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { deleteDatasetData } from '@/service/core/dataset/data/controller';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: ApiRequestProps<PushDatasetDataProps>, res: NextApiResponse<any>) {
  const body = req.body;
  // Adapter 4.9.0
  body.trainingType = body.trainingType || body.trainingMode;

  const { collectionId, data } = body;

  if (!collectionId || !Array.isArray(data)) {
    throw new Error('collectionId or data is empty');
  }

  if (data.length > 200) {
    throw new Error('Data is too long, max 200');
  }

  // Validate custom IDs if provided
  const invalidIds = data
    .filter((item) => item.id && !Types.ObjectId.isValid(item.id))
    .map((item, index) => `index ${index}: "${item.id}"`);

  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid ID format. IDs must be 24 character hex strings or valid ObjectIds. Invalid IDs found at: ${invalidIds.join(', ')}`
    );
  }

  // 凭证校验
  const { teamId, tmbId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  // Check if any IDs already exist and delete them
  const customIds = data.filter((item) => item.id).map((item) => item.id!);
  if (customIds.length > 0) {
    const existingData = await MongoDatasetData.find({
      _id: { $in: customIds.map((id) => new Types.ObjectId(id)) },
      teamId,
      collectionId
    }).lean();

    // Delete existing data
    if (existingData.length > 0) {
      const deletingIds = existingData.map((item) => String(item._id));
      addLog.info('[pushData] Deleting existing data with custom IDs:', {
        collectionId,
        ids: deletingIds,
        count: deletingIds.length
      });

      await Promise.all(
        existingData.map((dataItem) =>
          deleteDatasetData({
            id: String(dataItem._id),
            teamId: dataItem.teamId,
            indexes: dataItem.indexes,
            imageId: dataItem.imageId
          } as any)
        )
      );
    }
  }

  // Get training mode from collection
  const trainingMode = getTrainingModeByCollection({
    trainingType: collection.trainingType,
    autoIndexes: collection.autoIndexes,
    imageIndex: collection.imageIndex,
    small2bigIndexes: collection.small2bigIndexes,
    syntheticIndex: collection.syntheticIndex
  });

  // auth dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(trainingMode, data)
  });

  return pushDataListToTrainingQueue({
    ...body,
    teamId,
    tmbId,
    mode: trainingMode,
    datasetId: collection.datasetId,
    vectorModel: collection.dataset.vectorModel,
    agentModel: collection.dataset.agentModel,
    vlmModel: collection.dataset.vlmModel
  });
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '12mb'
  }
};
