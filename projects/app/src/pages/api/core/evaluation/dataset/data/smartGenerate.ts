import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import type { smartGenerateEvalDatasetBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addEvalDatasetDataSynthesizeJob } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  authEvaluationDatasetGenFromKnowledgeBase,
  authEvaluationDatasetCreate
} from '@fastgpt/service/core/evaluation/common';
import {
  checkTeamAIPoints,
  checkTeamEvalDatasetLimit
} from '@fastgpt/service/support/permission/teamLimit';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from '@fastgpt/global/core/evaluation/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getDefaultEvaluationModel } from '@fastgpt/service/core/ai/model';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/dataset/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

export type SmartGenerateEvalDatasetQuery = {};
export type SmartGenerateEvalDatasetBody = smartGenerateEvalDatasetBody;
export type SmartGenerateEvalDatasetResponse = {
  directInsertCount: number;
  queuedSynthesizeJobs: number;
  totalProcessed: number;
  collectionId: string;
};

async function handler(
  req: ApiRequestProps<SmartGenerateEvalDatasetBody, SmartGenerateEvalDatasetQuery>
): Promise<SmartGenerateEvalDatasetResponse> {
  const { collectionId, kbDatasetIds, count, intelligentGenerationModel, name, description } =
    req.body;

  if (!collectionId && !name) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  if (collectionId && name) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  // Validate collection name if creating new collection
  if (name) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return Promise.reject(EvaluationErrEnum.evalNameRequired);
    }
    if (name.trim().length > MAX_NAME_LENGTH) {
      return Promise.reject(EvaluationErrEnum.evalNameTooLong);
    }
  }

  if (description) {
    if (typeof description !== 'string') {
      return Promise.reject(EvaluationErrEnum.evalDescriptionInvalidType);
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return Promise.reject(EvaluationErrEnum.evalDescriptionTooLong);
    }
  }

  let teamId: string;
  let tmbId: string;
  let targetCollectionId: string;

  if (collectionId) {
    // Mode 1: Use existing collection
    const authResult = await authEvaluationDatasetGenFromKnowledgeBase(collectionId, kbDatasetIds, {
      req,
      authToken: true,
      authApiKey: true
    });
    teamId = authResult.teamId;
    tmbId = authResult.tmbId;
    targetCollectionId = collectionId;
  } else {
    // Mode 2: Create new collection
    const authResult = await authEvaluationDatasetCreate({
      req,
      authToken: true,
      authApiKey: true
    });
    teamId = authResult.teamId;
    tmbId = authResult.tmbId;

    // Validate access to knowledge base datasets
    await Promise.all(
      kbDatasetIds.map((datasetId) =>
        authDataset({
          req,
          authToken: true,
          authApiKey: true,
          datasetId,
          per: ReadPermissionVal
        })
      )
    );

    targetCollectionId = '';
  }

  if (!kbDatasetIds || !Array.isArray(kbDatasetIds) || kbDatasetIds.length === 0) {
    return Promise.reject(EvaluationErrEnum.evalInvalidFormat);
  }

  if (!intelligentGenerationModel || typeof intelligentGenerationModel !== 'string') {
    return Promise.reject(EvaluationErrEnum.datasetModelNotFound);
  }

  // Check AI points availability
  await checkTeamAIPoints(teamId);

  // Validate model
  if (!global.llmModelMap.has(intelligentGenerationModel)) {
    return Promise.reject(EvaluationErrEnum.datasetModelNotFound);
  }

  // Handle collection - either get existing or create new
  let evalDatasetCollection;
  if (collectionId) {
    // Mode 1: Use existing collection
    evalDatasetCollection = await MongoEvalDatasetCollection.findById(collectionId);
    if (!evalDatasetCollection) {
      return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
    }
    if (String(evalDatasetCollection.teamId) !== teamId) {
      return Promise.reject(EvaluationErrEnum.evalInsufficientPermission);
    }
  } else {
    // Mode 2: Create new collection

    // Check evaluation dataset limit
    await checkTeamEvalDatasetLimit(teamId);

    const existingCollection = await MongoEvalDatasetCollection.findOne({
      teamId,
      name: name!.trim()
    });
    if (existingCollection) {
      return Promise.reject(EvaluationErrEnum.evalDuplicateDatasetName);
    }

    const defaultEvaluationModel = getDefaultEvaluationModel();
    const evaluationModelToUse = intelligentGenerationModel || defaultEvaluationModel?.model;

    const collectionData = await mongoSessionRun(async (session) => {
      const [collection] = await MongoEvalDatasetCollection.create(
        [
          {
            teamId,
            tmbId,
            name: name!.trim(),
            description: (description || '').trim(),
            evaluationModel: evaluationModelToUse
          }
        ],
        { session, ordered: true }
      );
      return collection;
    });

    evalDatasetCollection = collectionData;
    targetCollectionId = String(collectionData._id);
  }

  const totalDataCount = await MongoDatasetData.countDocuments({
    teamId,
    datasetId: { $in: kbDatasetIds },
    $or: [{ q: { $exists: true } }]
  });

  if (totalDataCount === 0) {
    return Promise.reject(EvaluationErrEnum.selectedDatasetsContainNoData);
  }

  const finalCount = count !== undefined ? count : totalDataCount;

  if (finalCount < 1) {
    return Promise.reject(EvaluationErrEnum.countMustBeGreaterThanZero);
  }

  if (finalCount > totalDataCount) {
    return Promise.reject(EvaluationErrEnum.countExceedsAvailableData);
  }

  try {
    addLog.debug('Starting smart generate eval dataset processing', {
      collectionId: targetCollectionId,
      kbDatasetIds,
      finalCount,
      intelligentGenerationModel
    });

    const match = {
      teamId: new Types.ObjectId(teamId),
      datasetId: { $in: kbDatasetIds.map((id) => new Types.ObjectId(id)) }
    };

    const sampleData = await MongoDatasetData.aggregate(
      [
        {
          $match: match
        },
        {
          $sample: { size: finalCount }
        },
        {
          $project: {
            q: 1,
            a: 1,
            datasetId: 1,
            collectionId: 1
          }
        }
      ],
      {
        ...readFromSecondary
      }
    );

    if (sampleData.length === 0) {
      return Promise.reject(EvaluationErrEnum.selectedDatasetsContainNoData);
    }

    addLog.debug('Sampled data for processing', {
      collectionId: targetCollectionId,
      sampleCount: sampleData.length
    });

    const completeQAPairs: Array<Partial<EvalDatasetDataSchemaType>> = [];
    const synthesizeJobs: Array<{
      dataId: string;
      intelligentGenerationModel: string;
      evalDatasetCollectionId: string;
    }> = [];

    // Separate complete Q&A from Q-only data
    for (const sample of sampleData) {
      if (sample.q && sample.a) {
        // Complete Q&A pair - save directly
        const evalData: Partial<EvalDatasetDataSchemaType> = {
          teamId,
          tmbId,
          evalDatasetCollectionId: targetCollectionId,
          [EvalDatasetDataKeyEnum.UserInput]: sample.q,
          [EvalDatasetDataKeyEnum.ExpectedOutput]: sample.a,
          [EvalDatasetDataKeyEnum.ActualOutput]: '',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          qualityMetadata: {
            status: EvalDatasetDataQualityStatusEnum.unevaluated
          },
          synthesisMetadata: {
            sourceDataId: sample._id.toString(),
            sourceDatasetId: sample.datasetId.toString(),
            sourceCollectionId: sample.collectionId.toString(),
            intelligentGenerationModel,
            generatedAt: new Date()
          },
          createFrom: EvalDatasetDataCreateFromEnum.intelligentGeneration
        };
        completeQAPairs.push(evalData);
      } else if (sample.q && sample.a === '') {
        // Q-only - needs AI synthesis
        synthesizeJobs.push({
          dataId: sample._id.toString(),
          intelligentGenerationModel,
          evalDatasetCollectionId: targetCollectionId
        });
      }
    }

    // Direct insert complete Q&A pairs
    let directInsertCount = 0;
    if (completeQAPairs.length > 0) {
      const insertedRecords = await MongoEvalDatasetData.insertMany(completeQAPairs, {
        ordered: false
      });
      directInsertCount = insertedRecords.length;

      addLog.debug('Direct inserted complete eval dataset data', {
        collectionId: targetCollectionId,
        insertedCount: directInsertCount
      });
    }

    // Queue synthesis jobs for Q-only data
    let queuedSynthesizeJobs = 0;
    for (const synthData of synthesizeJobs) {
      await addEvalDatasetDataSynthesizeJob(synthData);
      queuedSynthesizeJobs++;
    }

    if (queuedSynthesizeJobs > 0) {
      addLog.debug('Queued synthesis jobs for Q-only data', {
        collectionId: targetCollectionId,
        queuedCount: queuedSynthesizeJobs
      });
    }

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

    const totalProcessed = directInsertCount + queuedSynthesizeJobs;

    addLog.debug('Completed smart generate eval dataset processing', {
      collectionId: targetCollectionId,
      directInsertCount,
      queuedSynthesizeJobs,
      totalProcessed
    });

    return {
      directInsertCount,
      queuedSynthesizeJobs,
      totalProcessed,
      collectionId: targetCollectionId
    };
  } catch (error: any) {
    addLog.error('Failed to process smart generate evaluation dataset', {
      collectionId: targetCollectionId || collectionId || 'new',
      kbDatasetIds,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return Promise.reject(EvaluationErrEnum.datasetTaskOperationFailed);
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
