import type { Job } from 'bullmq';
import type { HydratedDocument } from 'mongoose';
import { addLog } from '../../common/system/log';
import { MongoEvalDatasetCollection } from './evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from './evalDatasetDataSchema';
import { MongoDatasetData } from '../dataset/data/schema';
import { EvalDatasetDataCreateFromEnum } from '@fastgpt/global/core/evaluation/constants';
import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/type';
import {
  type EvalDatasetDataSynthesizeData,
  getEvalDatasetDataSynthesizeWorker
} from './dataSynthesizeMq';

async function processor(job: Job<EvalDatasetDataSynthesizeData>) {
  const { dataId, intelligentGenerationModel, evalDatasetCollectionId } = job.data;

  try {
    addLog.info('Starting eval dataset data synthesis', {
      dataId,
      evalDatasetCollectionId,
      intelligentGenerationModel
    });

    const sourceData = await MongoDatasetData.findById(dataId);
    if (!sourceData) {
      throw new Error(`Source dataset data not found: ${dataId}`);
    }

    // TODO: Authentication check
    const evalDatasetCollection =
      await MongoEvalDatasetCollection.findById(evalDatasetCollectionId);
    if (!evalDatasetCollection) {
      throw new Error(`Eval dataset not found: ${evalDatasetCollectionId}`);
    }

    // TODO: Implement AI model call for synthesis
    // This is where we would call the intelligent generation model
    // to generate expected_output based on user_input
    const synthesizedOutput = await synthesizeExpectedOutput(
      sourceData.q,
      intelligentGenerationModel
    );

    // Create new evaluation dataset record with synthesized data
    const evalData: Partial<EvalDatasetDataSchemaType> = {
      teamId: evalDatasetCollection.teamId,
      tmbId: evalDatasetCollection.tmbId,
      datasetId: evalDatasetCollectionId,
      user_input: sourceData.q,
      expected_output: synthesizedOutput,
      actual_output: '',
      context: [],
      retrieval_context: [],
      metadata: {
        sourceDataId: sourceData._id,
        sourceDatasetId: sourceData.datasetId,
        sourceCollectionId: sourceData.collectionId,
        generatedAt: new Date(),
        synthesizedAt: new Date(),
        intelligentGenerationModel
      },
      createFrom: EvalDatasetDataCreateFromEnum.intelligentGeneration
    };

    const insertedRecord = await MongoEvalDatasetData.create(evalData);

    addLog.info('Completed data synthesis', {
      dataId,
      evalDatasetCollectionId,
      insertedRecordId: insertedRecord._id,
      synthesizedLength: synthesizedOutput.length
    });

    await checkAndUpdateDatasetStatus(evalDatasetCollectionId);

    // TODO: Add audit log
    // TODO: Add tracking metrics

    return {
      success: true,
      insertedRecordId: insertedRecord._id,
      synthesizedOutput: synthesizedOutput
    };
  } catch (error) {
    addLog.error('Failed to synthesize eval dataset data', {
      dataId,
      evalDatasetCollectionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    // TODO: Update record status to error
    throw error;
  }
}

async function synthesizeExpectedOutput(
  userInput: string,
  intelligentGenerationModel: string
): Promise<string> {
  // TODO: Implement actual AI model call for synthesis
  // For now, return a placeholder that would be replaced with real implementation

  const prompt = `Question: ${userInput}\n\nProvide a comprehensive and accurate answer:`;

  // TODO: Replace with actual model API call
  // const response = await callAIModel(intelligentGenerationModel, prompt);
  // return response.text;

  // For now, return a synthesized placeholder
  return `[AI Generated Answer for: ${userInput.substring(0, 100)}${userInput.length > 100 ? '...' : ''}]`;
}

async function checkAndUpdateDatasetStatus(evalDatasetCollectionId: string) {
  try {
    const evalDatasetCollection =
      await MongoEvalDatasetCollection.findById(evalDatasetCollectionId);
    if (!evalDatasetCollection) return;

    const totalGeneratedCount = await MongoEvalDatasetData.countDocuments({
      datasetId: evalDatasetCollectionId,
      createFrom: EvalDatasetDataCreateFromEnum.intelligentGeneration
    });

    addLog.info('Dataset synthesis status check', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      totalGeneratedCount,
      expectedCount: evalDatasetCollection.dataCountByGen
    });

    // If we have reached expected count, mark as ready
    if (totalGeneratedCount >= evalDatasetCollection.dataCountByGen) {
      // TODO: Update dataset status to ready/completed
      addLog.info('Eval dataset synthesis completed', {
        evalDatasetCollectionId: evalDatasetCollectionId,
        totalGeneratedCount,
        expectedCount: evalDatasetCollection.dataCountByGen
      });
    }
  } catch (error) {
    addLog.error('Failed to check synthesis status', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      error
    });
  }
}

// Initialize worker
export const initEvalDatasetDataSynthesizeWorker = () => {
  return getEvalDatasetDataSynthesizeWorker(processor);
};
