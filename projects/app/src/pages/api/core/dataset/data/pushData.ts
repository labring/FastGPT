/* push data to training queue */
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
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
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { deleteDatasetData } from '@/service/core/dataset/data/controller';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { UserError } from '@fastgpt/global/common/error/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

async function handler(req: ApiRequestProps): Promise<PushDataResponseType> {
  const body = PushDataBodySchema.parse(req.body);
  // Adapter 4.9.0: support legacy trainingMode field
  body.trainingType = body.trainingType || body.trainingMode;

  const { collectionId, billId, data } = body;

  // 凭证校验
  const { teamId, tmbId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  const mode = getTrainingModeByCollection(collection);

  // auth dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(mode, data)
  });

  // Check if any IDs already exist
  const customIds = data.filter((item) => item.id).map((item) => item.id!);
  let existingDataList: {
    _id: any;
    collectionId: any;
    teamId: any;
    datasetId: any;
    indexes: any;
    imageId?: string | null;
  }[] = [];

  if (customIds.length > 0) {
    const existingData = await MongoDatasetData.find(
      {
        _id: { $in: customIds.map((id) => new Types.ObjectId(id)) },
        teamId
      },
      '_id collectionId teamId datasetId indexes imageId'
    ).lean();

    if (existingData.length > 0) {
      // Verify collectionId consistency — reject if any existing data belongs to a different collection
      const mismatchedData = existingData.filter(
        (item) => String(item.collectionId) !== collectionId
      );
      if (mismatchedData.length > 0) {
        logger.info('[pushData] Data IDs belong to different collections:', {
          collectionId,
          mismatchedIds: mismatchedData.map((item) => ({
            id: String(item._id),
            collectionId: String(item.collectionId)
          }))
        });

        throw new UserError(
          `Data IDs belong to different collections. Count: ${mismatchedData.length}. Please verify the IDs belong to the target collection.`
        );
      }

      logger.info('[pushData] Deleting existing data with custom IDs:', {
        collectionId,
        ids: existingData.map((item) => String(item._id)),
        count: existingData.length
      });

      existingDataList = existingData;
    }
  }

  return mongoSessionRun(async (session) => {
    // Delete existing data within the same session to prevent race conditions
    if (existingDataList.length > 0) {
      const results = await Promise.allSettled(
        existingDataList.map((dataItem) =>
          deleteDatasetData({
            id: String(dataItem._id),
            teamId: dataItem.teamId,
            datasetId: dataItem.datasetId,
            collectionId: dataItem.collectionId,
            indexes: dataItem.indexes,
            imageId: dataItem.imageId
          } as any)
        )
      );

      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        logger.error('[pushData] Some existing data failed to delete', {
          collectionId,
          failedCount: failed.length,
          errors: failed.map((r) => (r as PromiseRejectedResult).reason)
        });
        throw new Error(
          `Failed to delete ${failed.length} existing data. Aborting push to prevent data duplication.`
        );
      }
    }

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
      mode, // Use collection's training mode
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
