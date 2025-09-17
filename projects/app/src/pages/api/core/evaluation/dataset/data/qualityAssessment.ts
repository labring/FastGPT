import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import {
  addEvalDatasetDataQualityJob,
  checkEvalDatasetDataQualityJobActive
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import type { qualityAssessmentBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { EvalDatasetDataQualityStatusEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetDataUpdateById } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { addLog } from '@fastgpt/service/common/system/log';

export type QualityAssessmentQuery = {};
export type QualityAssessmentBody = qualityAssessmentBody;
export type QualityAssessmentResponse = string;

async function handler(
  req: ApiRequestProps<QualityAssessmentBody, QualityAssessmentQuery>
): Promise<QualityAssessmentResponse> {
  const { dataId, evaluationModel } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetDataUpdateById(dataId, {
    req,
    authToken: true,
    authApiKey: true
  });

  if (!dataId || typeof dataId !== 'string') {
    return Promise.reject(EvaluationErrEnum.datasetDataIdRequired);
  }

  if (evaluationModel !== undefined && typeof evaluationModel !== 'string') {
    return Promise.reject(EvaluationErrEnum.datasetModelNotFound);
  }

  // Check AI points availability
  await checkTeamAIPoints(teamId);

  const datasetData = await MongoEvalDatasetData.findById(dataId);
  if (!datasetData) {
    return Promise.reject(EvaluationErrEnum.datasetDataNotFound);
  }

  const collection = await MongoEvalDatasetCollection.findOne({
    _id: datasetData.evalDatasetCollectionId,
    teamId
  });

  if (!collection) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  const finalEvaluationModel = evaluationModel || collection.evaluationModel;

  if (!finalEvaluationModel || typeof finalEvaluationModel !== 'string') {
    return Promise.reject(EvaluationErrEnum.evalModelNameInvalid);
  }

  if (!global.llmModelMap.has(finalEvaluationModel)) {
    return Promise.reject(EvaluationErrEnum.datasetModelNotFound);
  }

  try {
    const isJobActive = await checkEvalDatasetDataQualityJobActive(dataId);
    if (isJobActive) {
      return Promise.reject(EvaluationErrEnum.evalDataQualityJobActiveCannotSetHighQuality);
    }

    await addEvalDatasetDataQualityJob({
      dataId: dataId,
      evaluationModel: finalEvaluationModel
    });

    await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
      $set: {
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.queuing,
        'qualityMetadata.model': finalEvaluationModel,
        'qualityMetadata.queueTime': new Date()
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
    addLog.error('Failed to queue quality assessment job', { dataId, teamId, error });
    return Promise.reject(EvaluationErrEnum.qualityAssessmentFailed);
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
