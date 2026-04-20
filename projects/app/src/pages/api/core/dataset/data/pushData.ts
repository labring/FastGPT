/* push data to training queue */
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
import {
  PushDataBodySchema,
  type PushDataResponseType
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { getVlmModel } from '@fastgpt/service/core/ai/model';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

async function handler(req: ApiRequestProps): Promise<PushDataResponseType> {
  const body = PushDataBodySchema.parse(req.body);
  // Adapter 4.9.0: support legacy trainingMode field
  body.trainingType = body.trainingType || body.trainingMode;

  const { collectionId, billId, data } = body;

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
  const mode = getTrainingModeByCollection({
    trainingType: collection.trainingType,
    autoIndexes: collection.autoIndexes,
    imageIndex: collection.imageIndex,
    small2bigIndexes: collection.small2bigIndexes,
    syntheticIndex: collection.syntheticIndex
  });

  // auth dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(mode, data)
  });

  return mongoSessionRun(async (session) => {
    const traingUsageId = await (async () => {
      if (billId) return billId;
      const { usageId: newUsageId } = await createTrainingUsage({
        teamId,
        tmbId,
        appName: collection.name,
        billSource: UsageSourceEnum.training,
        vectorModel: getEmbeddingModel(collection.dataset.vectorModel)?.name,
        agentModel: getLLMModel(collection.dataset.agentModel)?.name,
        vllmModel: getVlmModel(collection.dataset.vlmModel)?.name,
        session
      });
      return newUsageId;
    })();

    return pushDataListToTrainingQueue({
      ...body,
      session,
      billId: traingUsageId,
      mode,
      teamId,
      tmbId,
      datasetId: collection.datasetId,
      vectorModel: collection.dataset.vectorModel,
      agentModel: collection.dataset.agentModel,
      vlmModel: collection.dataset.vlmModel
    });
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
