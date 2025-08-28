import type { Job } from 'bullmq';
import type { HydratedDocument } from 'mongoose';
import { addLog } from '../../../common/system/log';
import { MongoEvalDatasetCollection } from './evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from './evalDatasetDataSchema';
import { MongoDatasetData } from '../../dataset/data/schema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/constants';
import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/type';
import {
  type EvalDatasetSmartGenerateData,
  getEvalDatasetSmartGenerateWorker
} from './smartGenerateMq';
import { addEvalDatasetDataSynthesizeJob } from './dataSynthesizeMq';

async function processor(job: Job<EvalDatasetSmartGenerateData>) {
  const { datasetCollectionIds, count, intelligentGenerationModel, evalDatasetCollectionId } =
    job.data;

  try {
    addLog.info('Starting eval dataset smart generation', {
      evalDatasetCollectionId,
      datasetCollectionIds,
      count
    });

    const sampleSize = Number(count);
    if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
      throw new Error(`Invalid count parameter: ${count}. Must be a positive integer.`);
    }

    // TODO: Authentication check - get team and user info from eval dataset
    const evalDatasetCollection =
      await MongoEvalDatasetCollection.findById(evalDatasetCollectionId);
    if (!evalDatasetCollection) {
      throw new Error(`Eval dataset collection not found: ${evalDatasetCollectionId}`);
    }

    // TODO: Optimize the acquisition of dataset data
    const sampleData = await MongoDatasetData.find(
      {
        teamId: evalDatasetCollection.teamId,
        collectionId: { $in: datasetCollectionIds }
      },
      'q a datasetId collectionId'
    )
      .sort({ updateTime: -1 })
      .limit(100)
      .lean();

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
          datasetId: evalDatasetCollectionId,
          [EvalDatasetDataKeyEnum.UserInput]: sample.q,
          [EvalDatasetDataKeyEnum.ExpectedOutput]: sample.a,
          [EvalDatasetDataKeyEnum.ActualOutput]: '',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          metadata: {
            sourceDataId: sample._id,
            sourceDatasetId: sample.datasetId,
            sourceCollectionId: sample.collectionId,
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

    // TODO: Add audit log
    // TODO: Add tracking metrics

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

    // TODO: Update dataset status to error
    throw error;
  }
}

// Initialize worker
export const initEvalDatasetSmartGenerateWorker = () => {
  return getEvalDatasetSmartGenerateWorker(processor);
};
