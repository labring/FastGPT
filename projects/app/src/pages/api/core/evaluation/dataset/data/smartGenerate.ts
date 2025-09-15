import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import type { smartGenerateEvalDatasetBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addEvalDatasetDataSynthesizeJob } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetGenFromKnowledgeBase } from '@fastgpt/service/core/evaluation/common';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/dataset/type';

export type SmartGenerateEvalDatasetQuery = {};
export type SmartGenerateEvalDatasetBody = smartGenerateEvalDatasetBody;
export type SmartGenerateEvalDatasetResponse = {
  directInsertCount: number;
  queuedSynthesizeJobs: number;
  totalProcessed: number;
};

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

  // Validate model exists
  if (!global.llmModelMap.has(intelligentGenerationModel)) {
    return Promise.reject(EvaluationErrEnum.datasetModelNotFound);
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
    addLog.info('Starting smart generate eval dataset processing', {
      collectionId,
      kbDatasetIds,
      finalCount,
      intelligentGenerationModel
    });

    // Sample data directly in API
    const match = {
      teamId: new Types.ObjectId(teamId),
      collectionId: { $in: kbCollectionIds.map((id) => new Types.ObjectId(id)) }
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

    addLog.info('Sampled data for processing', {
      collectionId,
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
          evalDatasetCollectionId: collectionId,
          [EvalDatasetDataKeyEnum.UserInput]: sample.q,
          [EvalDatasetDataKeyEnum.ExpectedOutput]: sample.a,
          [EvalDatasetDataKeyEnum.ActualOutput]: '',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          metadata: {
            sourceDataId: sample._id,
            sourceDatasetId: sample.datasetId,
            sourceCollectionId: sample.collectionId,
            qualityStatus: EvalDatasetDataQualityStatusEnum.unevaluated,
            generatedAt: new Date(),
            intelligentGenerationModel
          },
          createFrom: EvalDatasetDataCreateFromEnum.intelligentGeneration
        };
        completeQAPairs.push(evalData);
      } else if (sample.q && sample.a === '') {
        // Q-only - needs AI synthesis
        synthesizeJobs.push({
          dataId: sample._id.toString(),
          intelligentGenerationModel,
          evalDatasetCollectionId: collectionId
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

      addLog.info('Direct inserted complete eval dataset data', {
        collectionId,
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
      addLog.info('Queued synthesis jobs for Q-only data', {
        collectionId,
        queuedCount: queuedSynthesizeJobs
      });
    }

    // Add audit log
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

    addLog.info('Completed smart generate eval dataset processing', {
      collectionId,
      directInsertCount,
      queuedSynthesizeJobs,
      totalProcessed
    });

    return {
      directInsertCount,
      queuedSynthesizeJobs,
      totalProcessed
    };
  } catch (error: any) {
    addLog.error('Failed to process smart generate evaluation dataset', {
      collectionId,
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
