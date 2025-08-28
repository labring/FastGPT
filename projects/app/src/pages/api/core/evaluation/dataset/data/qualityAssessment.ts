import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import {
  addEvalDatasetDataQualityJob,
  removeEvalDatasetDataQualityJob,
  checkEvalDatasetDataQualityJobActive
} from '@fastgpt/service/core/evaluation/dataQualityMq';
import type { qualityAssessmentBody } from '@fastgpt/global/core/evaluation/api';

export type QualityAssessmentQuery = {};
export type QualityAssessmentBody = qualityAssessmentBody;
export type QualityAssessmentResponse = string;

async function handler(
  req: ApiRequestProps<QualityAssessmentBody, QualityAssessmentQuery>
): Promise<QualityAssessmentResponse> {
  const { dataId, evalModel } = req.body;

  if (!dataId || typeof dataId !== 'string') {
    return 'dataId is required and must be a string';
  }

  if (!evalModel || typeof evalModel !== 'string') {
    return 'evalModel is required and must be a string';
  }

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  const datasetData = await MongoEvalDatasetData.findById(dataId);
  if (!datasetData) {
    return 'Dataset data not found';
  }

  const collection = await MongoEvalDatasetCollection.findOne({
    _id: datasetData.datasetId,
    teamId
  });

  if (!collection) {
    return 'Dataset collection not found or access denied';
  }

  try {
    const isJobActive = await checkEvalDatasetDataQualityJobActive(dataId);
    if (isJobActive) {
      await removeEvalDatasetDataQualityJob(dataId);
    }

    await addEvalDatasetDataQualityJob({
      dataId: dataId,
      evalModel: evalModel
    });

    await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
      $set: {
        'metadata.qualityStatus': 'queuing',
        'metadata.qualityModel': evalModel,
        'metadata.qualityQueueTime': new Date()
      }
    });

    // TODO: Add audit log for quality assessment request
    // TODO: Add tracking for quality assessment metrics

    return 'success';
  } catch (error) {
    return error instanceof Error ? error.message : 'Failed to queue quality assessment job';
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
