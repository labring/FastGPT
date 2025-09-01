import type { Job } from 'bullmq';
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
    // to generate expectedOutput based on userInput
    const synthesizedOutput = await synthesizeExpectedOutput(
      sourceData.q,
      intelligentGenerationModel
    );

    // Create new evaluation dataset record with synthesized data
    const evalData: Partial<EvalDatasetDataSchemaType> = {
      teamId: evalDatasetCollection.teamId,
      tmbId: evalDatasetCollection.tmbId,
      datasetId: evalDatasetCollectionId,
      [EvalDatasetDataKeyEnum.UserInput]: sourceData.q,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: synthesizedOutput,
      [EvalDatasetDataKeyEnum.ActualOutput]: '',
      [EvalDatasetDataKeyEnum.Context]: [],
      [EvalDatasetDataKeyEnum.RetrievalContext]: [],
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

// Initialize worker
export const initEvalDatasetDataSynthesizeWorker = () => {
  return getEvalDatasetDataSynthesizeWorker(processor);
};
