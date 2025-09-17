import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import {
  addEvalDatasetDataQualityJob,
  evalDatasetDataQualityQueue,
  removeEvalDatasetDataQualityJobsRobust
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import type {
  qualityAssessmentBatchBody,
  qualityAssessmentBatchResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { EvalDatasetDataQualityStatusEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetWrite } from '@fastgpt/service/core/evaluation/common';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { getEvaluationModel } from '@fastgpt/service/core/ai/model';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export type QualityAssessmentBatchQuery = {};
export type QualityAssessmentBatchBody = qualityAssessmentBatchBody;
export type QualityAssessmentBatchResponse = qualityAssessmentBatchResponse;
async function handler(
  req: ApiRequestProps<QualityAssessmentBatchBody, QualityAssessmentBatchQuery>
): Promise<QualityAssessmentBatchResponse> {
  const { collectionId, evaluationModel } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetWrite(collectionId, {
    req,
    authApiKey: true,
    authToken: true
  });

  if (!collectionId || typeof collectionId !== 'string') {
    return Promise.reject(EvaluationErrEnum.datasetCollectionIdRequired);
  }

  if (evaluationModel !== undefined && typeof evaluationModel !== 'string') {
    return Promise.reject(EvaluationErrEnum.evalModelNameInvalid);
  }

  if (evaluationModel) {
    if (!global.llmModelMap.has(evaluationModel)) {
      return Promise.reject(EvaluationErrEnum.datasetModelNotFound);
    }
  }

  // Check AI points availability
  await checkTeamAIPoints(teamId);

  const collection = await MongoEvalDatasetCollection.findOne({
    _id: collectionId,
    teamId
  });

  if (!collection) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  const finalEvaluationModel = getEvaluationModel(evaluationModel || collection.evaluationModel);

  if (!finalEvaluationModel) {
    return Promise.reject(EvaluationErrEnum.evaluatorLLmModelNotFound);
  }

  const evalModel = finalEvaluationModel.model;

  const dataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: collectionId,
    teamId
  }).select('_id');

  if (dataItems.length === 0) {
    return Promise.reject(EvaluationErrEnum.datasetNoData);
  }

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const dataItem of dataItems) {
    const dataId = dataItem._id.toString();

    try {
      const jobId = await evalDatasetDataQualityQueue.getDeduplicationJobId(dataId);
      let jobState = null;

      if (jobId) {
        const job = await evalDatasetDataQualityQueue.getJob(jobId);
        if (job) {
          jobState = await job.getState();
        }
      }

      if (jobState && ['waiting', 'delayed', 'prioritized', 'active'].includes(jobState)) {
        // Tasks in queue or active -> not affected
        addLog.info('Skipping queued or active quality assessment job', {
          dataId,
          jobState,
          collectionId
        });
        skippedCount++;
      } else {
        // Completed or abnormal tasks -> will be re-evaluated
        // This includes: completed, failed, or no existing job
        if (jobState && ['completed', 'failed'].includes(jobState)) {
          addLog.info('Re-evaluating completed/failed quality assessment job', {
            dataId,
            jobState,
            collectionId
          });
        }

        // Remove existing job if any (for completed/failed states)
        if (jobId) {
          await removeEvalDatasetDataQualityJobsRobust([dataId]);
        }

        // Create new job
        await addEvalDatasetDataQualityJob({
          dataId: dataId,
          evaluationModel: evalModel
        });

        // Update quality metadata
        await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
          $set: {
            'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.queuing,
            'qualityMetadata.model': evalModel,
            'qualityMetadata.queueTime': new Date()
          }
        });

        processedCount++;
      }
    } catch (error) {
      addLog.error('Failed to process quality assessment for data item', {
        dataId,
        collectionId,
        error: error instanceof Error ? error.message : String(error)
      });
      errorCount++;
    }
  }

  const message = `Batch quality assessment completed. Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`;

  addLog.info('Batch quality assessment completed', {
    collectionId,
    finalEvaluationModel: evalModel,
    processedCount,
    skippedCount,
    errorCount,
    totalItems: dataItems.length
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.QUALITY_ASSESSMENT_EVALUATION_DATA,
      params: {
        collectionName: collection.name
      }
    });
  })();

  return {
    success: errorCount === 0 || processedCount > 0,
    message,
    processedCount,
    skippedCount,
    errorCount
  };
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
