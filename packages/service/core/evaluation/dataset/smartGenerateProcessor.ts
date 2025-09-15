import type { Job } from 'bullmq';
import type { HydratedDocument } from 'mongoose';
import { Types } from '../../../common/mongo';
import { readFromSecondary } from '../../../common/mongo/utils';
import { addLog } from '../../../common/system/log';
import { MongoEvalDatasetCollection } from './evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from './evalDatasetDataSchema';
import { MongoDatasetData } from '../../dataset/data/schema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/dataset/type';
import {
  type EvalDatasetSmartGenerateData,
  getEvalDatasetSmartGenerateWorker
} from './smartGenerateMq';
import { addEvalDatasetDataSynthesizeJob } from './dataSynthesizeMq';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { addAuditLog } from '../../../support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function processor(job: Job<EvalDatasetSmartGenerateData>) {
  const { datasetCollectionIds, count, intelligentGenerationModel, evalDatasetCollectionId } =
    job.data;

  if (!global.llmModelMap.has(intelligentGenerationModel)) {
    const errorMsg = `Invalid intelligent generation model: ${intelligentGenerationModel}`;
    addLog.error('Eval dataset smart generation failed - invalid model', {
      evalDatasetCollectionId,
      intelligentGenerationModel
    });
    throw new Error(errorMsg);
  }

  try {
    addLog.info('Starting eval dataset smart generation', {
      evalDatasetCollectionId,
      datasetCollectionIds,
      count,
      intelligentGenerationModel
    });

    const sampleSize = Number(count);
    if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
      throw new Error(`Invalid count parameter: ${count}. Must be a positive integer.`);
    }

    const evalDatasetCollection =
      await MongoEvalDatasetCollection.findById(evalDatasetCollectionId);
    if (!evalDatasetCollection) {
      throw new Error(`Eval dataset collection not found: ${evalDatasetCollectionId}`);
    }

    await checkTeamAIPoints(evalDatasetCollection.teamId);

    const match = {
      teamId: new Types.ObjectId(evalDatasetCollection.teamId),
      collectionId: { $in: datasetCollectionIds.map((id) => new Types.ObjectId(id)) }
    };

    const sampleData = await MongoDatasetData.aggregate(
      [
        {
          $match: match
        },
        {
          $sample: { size: sampleSize }
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
      throw new Error('No data found in selected dataset collections');
    }

    addLog.info('Retrieved sample data for generation', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      sampleCount: sampleData.length
    });

    const generateData: Array<Partial<EvalDatasetDataSchemaType>> = [];
    const synthesisData: Array<{
      dataId: string;
      intelligentGenerationModel: string;
      evalDatasetCollectionId: string;
    }> = [];

    for (const sample of sampleData) {
      if (sample.q && sample.a) {
        // Direct QA pair - can be used immediately
        const evalData: Partial<EvalDatasetDataSchemaType> = {
          teamId: evalDatasetCollection.teamId,
          tmbId: evalDatasetCollection.tmbId,
          evalDatasetCollectionId: evalDatasetCollectionId,
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
        generateData.push(evalData);
      } else if (sample.q && sample.a === '') {
        // Only Q - add to synthesis data list (not saved to mongo here)
        synthesisData.push({
          dataId: sample._id.toString(),
          intelligentGenerationModel,
          evalDatasetCollectionId
        });
      }
    }

    // Bulk insert complete evaluation dataset data
    let insertedRecords: HydratedDocument<EvalDatasetDataSchemaType>[] = [];
    if (generateData.length > 0) {
      insertedRecords = await MongoEvalDatasetData.insertMany(generateData, {
        ordered: false
      });

      addLog.info('Inserted complete eval dataset data', {
        evalDatasetCollectionId: evalDatasetCollectionId,
        insertedCount: insertedRecords.length
      });
    }

    // Queue synthesis jobs for data that needs processing (synthesisData)
    const synthesizeJobs = [];
    for (const synthData of synthesisData) {
      const synthesizeJob = await addEvalDatasetDataSynthesizeJob(synthData);
      synthesizeJobs.push(synthesizeJob);
    }

    if (synthesizeJobs.length > 0) {
      addLog.info('Queued synthesis jobs', {
        evalDatasetCollectionId: evalDatasetCollectionId,
        synthesizeJobsCount: synthesizeJobs.length
      });
    }

    (async () => {
      addAuditLog({
        teamId: evalDatasetCollection.teamId,
        tmbId: evalDatasetCollection.tmbId,
        event: AuditEventEnum.SMART_GENERATE_EVALUATION_DATA,
        params: {
          collectionName: evalDatasetCollection.name
        }
      });
    })();

    addLog.info('Completed eval dataset smart generation', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      generateDataCount: insertedRecords.length,
      synthesisDataCount: synthesisData.length,
      synthesizeJobsCount: synthesizeJobs.length
    });

    return {
      success: true,
      generateDataCount: insertedRecords.length,
      synthesisDataCount: synthesisData.length,
      synthesizeJobsCount: synthesizeJobs.length
    };
  } catch (error) {
    addLog.error('Failed to process eval dataset smart generation', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

// Initialize worker
export const initEvalDatasetSmartGenerateWorker = () => {
  return getEvalDatasetSmartGenerateWorker(processor);
};
