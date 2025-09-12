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
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';

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

  if (!collectionId || typeof collectionId !== 'string') {
    return Promise.reject(EvaluationErrEnum.datasetCollectionIdRequired);
  }

  if (!kbDatasetIds || !Array.isArray(kbDatasetIds) || kbDatasetIds.length === 0) {
    return Promise.reject(EvaluationErrEnum.evalInvalidFormat);
  }

  if (!intelligentGenerationModel || typeof intelligentGenerationModel !== 'string') {
    return Promise.reject(EvaluationErrEnum.datasetModelNotFound);
  }

  // Check AI points availability
  await checkTeamAIPoints(teamId);

  const evalDatasetCollection = await MongoEvalDatasetCollection.findById(collectionId);
  if (!evalDatasetCollection) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  if (String(evalDatasetCollection.teamId) !== teamId) {
    return Promise.reject(EvaluationErrEnum.evalInsufficientPermission);
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
    return Promise.reject(EvaluationErrEnum.evalInsufficientPermission);
  }

  const totalDataCount = await MongoDatasetData.countDocuments({
    teamId,
    collectionId: { $in: kbCollectionIds },
    $or: [{ q: { $exists: true } }]
  });

  if (totalDataCount === 0) {
    return Promise.reject(EvaluationErrEnum.selectedDatasetsContainNoData);
  }

  // Use totalDataCount as default when count is undefined
  const finalCount = count !== undefined ? count : totalDataCount;

  if (finalCount < 1) {
    return Promise.reject(EvaluationErrEnum.countMustBeGreaterThanZero);
  }

  if (finalCount > totalDataCount) {
    return Promise.reject(EvaluationErrEnum.countExceedsAvailableData);
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
    addLog.error('Failed to queue smart generate evaluation dataset job', {
      collectionId,
      kbDatasetIds,
      error: error instanceof Error ? error.message : String(error)
    });
    return Promise.reject(EvaluationErrEnum.datasetTaskOperationFailed);
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
