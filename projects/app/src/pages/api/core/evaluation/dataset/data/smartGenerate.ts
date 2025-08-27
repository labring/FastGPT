import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import type { smartGenerateEvalDatasetBody } from '@fastgpt/global/core/evaluation/api';
import { addEvalDatasetSmartGenerateJob } from '@fastgpt/service/core/evaluation/smartGenerateMq';

export type SmartGenerateEvalDatasetQuery = {};
export type SmartGenerateEvalDatasetBody = smartGenerateEvalDatasetBody;
export type SmartGenerateEvalDatasetResponse = string;

async function handler(
  req: ApiRequestProps<SmartGenerateEvalDatasetBody, SmartGenerateEvalDatasetQuery>
): Promise<SmartGenerateEvalDatasetResponse> {
  const { collectionId, datasetCollectionIds, count = 0, intelligentGenerationModel } = req.body;

  // Parameter validation
  if (!collectionId || typeof collectionId !== 'string') {
    return Promise.reject('collectionId is required and must be a string');
  }

  if (
    !datasetCollectionIds ||
    !Array.isArray(datasetCollectionIds) ||
    datasetCollectionIds.length === 0
  ) {
    return Promise.reject('datasetCollectionIds is required and must be a non-empty array');
  }

  if (count < 1) {
    return Promise.reject('count must be large 1');
  }

  if (!intelligentGenerationModel || typeof intelligentGenerationModel !== 'string') {
    return Promise.reject('intelligentGenerationModel is required and must be a string');
  }

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  const evalDatasetCollection = await MongoEvalDatasetCollection.findById(collectionId);
  if (!evalDatasetCollection) {
    return Promise.reject('Evaluation dataset collection not found');
  }

  if (String(evalDatasetCollection.teamId) !== teamId) {
    return Promise.reject('No permission to access this evaluation dataset collection');
  }

  const datasetCollections = await MongoDatasetCollection.find({
    _id: { $in: datasetCollectionIds },
    teamId
  });

  if (datasetCollections.length !== datasetCollectionIds.length) {
    return Promise.reject('One or more dataset collections not found or no permission');
  }

  // Calculate total data count from selected collections for validation
  const totalDataCount = await MongoDatasetData.countDocuments({
    teamId,
    collectionId: { $in: datasetCollectionIds }
  });

  if (totalDataCount === 0) {
    return Promise.reject('Selected dataset collections contain no data');
  }

  if (count > totalDataCount) {
    return Promise.reject(
      `Requested count (${count}) exceeds available data count (${totalDataCount}) in selected collections`
    );
  }

  try {
    const job = await addEvalDatasetSmartGenerateJob({
      datasetCollectionIds,
      count,
      intelligentGenerationModel,
      evalDatasetCollectionId: collectionId
    });

    await MongoEvalDatasetCollection.findByIdAndUpdate(collectionId, {
      $inc: { dataCountByGen: count }
    });

    // TODO: Add audit log for smart generation operation
    // TODO: Add tracking metrics for smart generation

    return job.id || 'queued';
  } catch (error: any) {
    return Promise.reject(`Failed to queue smart generation: ${error.message}`);
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
