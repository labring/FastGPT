import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import {
  addEvalDatasetDataQualityJob,
  checkEvalDatasetDataQualityJobActive,
  removeEvalDatasetDataQualityJobsRobust
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import type { qualityAssessmentBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { EvalDatasetDataQualityStatusEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetDataUpdateById } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export type QualityAssessmentQuery = {};
export type QualityAssessmentBody = qualityAssessmentBody;
export type QualityAssessmentResponse = string;

async function handler(
  req: ApiRequestProps<QualityAssessmentBody, QualityAssessmentQuery>
): Promise<QualityAssessmentResponse> {
  const { dataId, evalModel } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetDataUpdateById(dataId, {
    req,
    authToken: true,
    authApiKey: true
  });

  if (!dataId || typeof dataId !== 'string') {
    return 'dataId is required and must be a string';
  }

  if (!evalModel || typeof evalModel !== 'string') {
    return 'evalModel is required and must be a string';
  }

  const datasetData = await MongoEvalDatasetData.findById(dataId);
  if (!datasetData) {
    return Promise.reject(EvaluationErrEnum.evalDatasetDataNotFound);
  }

  const collection = await MongoEvalDatasetCollection.findOne({
    _id: datasetData.datasetId,
    teamId
  });

  if (!collection) {
    return Promise.reject(EvaluationErrEnum.evalDatasetCollectionNotFound);
  }

  try {
    const isJobActive = await checkEvalDatasetDataQualityJobActive(dataId);
    if (isJobActive) {
      await removeEvalDatasetDataQualityJobsRobust([dataId], {
        forceCleanActiveJobs: true,
        retryDelay: 200
      });
    }

    await addEvalDatasetDataQualityJob({
      dataId: dataId,
      evalModel: evalModel
    });

    await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
      $set: {
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.queuing,
        'metadata.qualityModel': evalModel,
        'metadata.qualityQueueTime': new Date()
      }
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

    return 'success';
  } catch (error) {
    return error instanceof Error ? error.message : 'Failed to queue quality assessment job';
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
