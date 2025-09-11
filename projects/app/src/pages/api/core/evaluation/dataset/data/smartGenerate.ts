import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import type { smartGenerateEvalDatasetBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addEvalDatasetSmartGenerateJob } from '@fastgpt/service/core/evaluation/dataset/smartGenerateMq';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetGenFromKnowledgeBase } from '@fastgpt/service/core/evaluation/common';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';

export type SmartGenerateEvalDatasetQuery = {};
export type SmartGenerateEvalDatasetBody = smartGenerateEvalDatasetBody;
export type SmartGenerateEvalDatasetResponse = string;

async function handler(
  req: ApiRequestProps<SmartGenerateEvalDatasetBody, SmartGenerateEvalDatasetQuery>
): Promise<SmartGenerateEvalDatasetResponse> {
  const { collectionId, kbDatasetIds, count, intelligentGenerationModel } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetGenFromKnowledgeBase(
    collectionId,
    kbDatasetIds,
    {
      req,
      authToken: true,
      authApiKey: true
    }
  );

  // Check AI points availability
  await checkTeamAIPoints(teamId);

  if (!collectionId || typeof collectionId !== 'string') {
    return Promise.reject('collectionId is required and must be a string');
  }

  if (!kbDatasetIds || !Array.isArray(kbDatasetIds) || kbDatasetIds.length === 0) {
    return Promise.reject('datasetIds is required and must be a non-empty array');
  }

  if (!intelligentGenerationModel || typeof intelligentGenerationModel !== 'string') {
    return Promise.reject('intelligentGenerationModel is required and must be a string');
  }

  const evalDatasetCollection = await MongoEvalDatasetCollection.findById(collectionId);
  if (!evalDatasetCollection) {
    return Promise.reject('Evaluation dataset collection not found');
  }

  if (String(evalDatasetCollection.teamId) !== teamId) {
    return Promise.reject('No permission to access this evaluation dataset collection');
  }

  // Find all collections that belong to the specified datasets
  const datasetCollections = await MongoDatasetCollection.find({
    datasetId: { $in: kbDatasetIds },
    teamId
  });

  const kbCollectionIds = datasetCollections.map((collection) => collection._id);
  const foundDatasetIds = [
    ...new Set(datasetCollections.map((collection) => String(collection.datasetId)))
  ];
  if (foundDatasetIds.length !== kbDatasetIds.length) {
    return Promise.reject('One or more datasets not found or no permission');
  }

  const totalDataCount = await MongoDatasetData.countDocuments({
    teamId,
    collectionId: { $in: kbCollectionIds },
    $or: [{ q: { $exists: true } }]
  });

  if (totalDataCount === 0) {
    return Promise.reject('Selected dataset collections contain no data');
  }

  // Use totalDataCount as default when count is undefined
  const finalCount = count !== undefined ? count : totalDataCount;

  if (finalCount < 1) {
    return Promise.reject('count must be greater than 0');
  }

  if (finalCount > totalDataCount) {
    return Promise.reject(
      `Requested count (${finalCount}) exceeds available data count (${totalDataCount}) in selected collections`
    );
  }

  try {
    const job = await addEvalDatasetSmartGenerateJob({
      datasetCollectionIds: kbCollectionIds,
      count: finalCount,
      intelligentGenerationModel,
      evalDatasetCollectionId: collectionId
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.SMART_GENERATE_EVALUATION_DATA,
        params: {
          collectionName: evalDatasetCollection.name
        }
      });
    })();

    return job.id || 'queued';
  } catch (error: any) {
    return Promise.reject(`Failed to queue smart generation: ${error.message}`);
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
