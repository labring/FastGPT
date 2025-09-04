import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import {
  addEvalDatasetDataQualityJob,
  removeEvalDatasetDataQualityJob,
  evalDatasetDataQualityQueue
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import type {
  qualityAssessmentBatchBody,
  qualityAssessmentBatchResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { EvalDatasetDataQualityStatusEnum } from '@fastgpt/global/core/evaluation/dataset/constants';

export type QualityAssessmentBatchQuery = {};
export type QualityAssessmentBatchBody = qualityAssessmentBatchBody;
export type QualityAssessmentBatchResponse = qualityAssessmentBatchResponse;
async function handler(
  req: ApiRequestProps<QualityAssessmentBatchBody, QualityAssessmentBatchQuery>
): Promise<QualityAssessmentBatchResponse> {
  const { collectionId, evalModel } = req.body;

  if (!collectionId || typeof collectionId !== 'string') {
    return {
      success: false,
      message: 'collectionId is required and must be a string',
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0
    };
  }

  if (!evalModel || typeof evalModel !== 'string') {
    return {
      success: false,
      message: 'evalModel is required and must be a string',
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0
    };
  }

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  const collection = await MongoEvalDatasetCollection.findOne({
    _id: collectionId,
    teamId
  });

  if (!collection) {
    return {
      success: false,
      message: 'Dataset collection not found or access denied',
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0
    };
  }

  const dataItems = await MongoEvalDatasetData.find({
    datasetId: collectionId,
    teamId
  }).select('_id');

  if (dataItems.length === 0) {
    return {
      success: true,
      message: 'No data items found in the collection',
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0
    };
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

      if (jobState === 'active') {
        // Active evaluation task -> remove and overwrite
        addLog.info('Removing active quality assessment job for re-evaluation', {
          dataId,
          jobId,
          collectionId
        });
        await removeEvalDatasetDataQualityJob(dataId);

        // Create new job
        await addEvalDatasetDataQualityJob({
          dataId: dataId,
          evalModel: evalModel
        });

        // Update metadata
        await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
          $set: {
            'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.queuing,
            'metadata.qualityModel': evalModel,
            'metadata.qualityQueueTime': new Date()
          }
        });

        processedCount++;
      } else if (jobState && ['waiting', 'delayed', 'prioritized'].includes(jobState)) {
        // Tasks in queue -> not affected
        addLog.info('Skipping queued quality assessment job', {
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
          await removeEvalDatasetDataQualityJob(dataId);
        }

        // Create new job
        await addEvalDatasetDataQualityJob({
          dataId: dataId,
          evalModel: evalModel
        });

        // Update metadata
        await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
          $set: {
            'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.queuing,
            'metadata.qualityModel': evalModel,
            'metadata.qualityQueueTime': new Date()
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
    evalModel,
    processedCount,
    skippedCount,
    errorCount,
    totalItems: dataItems.length
  });

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
