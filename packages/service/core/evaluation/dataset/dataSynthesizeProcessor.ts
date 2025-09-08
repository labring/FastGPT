import type { Job } from 'bullmq';
import { addLog } from '../../../common/system/log';
import { MongoEvalDatasetCollection } from './evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from './evalDatasetDataSchema';
import { MongoDatasetData } from '../../dataset/data/schema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/dataset/type';
import {
  type EvalDatasetDataSynthesizeData,
  getEvalDatasetDataSynthesizeWorker
} from './dataSynthesizeMq';
import { createSynthesizerInstance } from '../synthesizer';

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

    const llmConfig = {
      name: intelligentGenerationModel
    };

    const synthesisCase = {
      context: sourceData.q ? [sourceData.q] : []
    };

    const synthesizer = createSynthesizerInstance('q_a_synthesizer', llmConfig);
    const synthesisResult = await synthesizer.synthesize(synthesisCase);

    const evalData: Partial<EvalDatasetDataSchemaType> = {
      teamId: evalDatasetCollection.teamId,
      tmbId: evalDatasetCollection.tmbId,
      datasetId: evalDatasetCollectionId,
      [EvalDatasetDataKeyEnum.UserInput]: synthesisResult.data?.qaPair.question,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: synthesisResult.data?.qaPair.answer,
      [EvalDatasetDataKeyEnum.ActualOutput]: '',
      [EvalDatasetDataKeyEnum.Context]: [],
      [EvalDatasetDataKeyEnum.RetrievalContext]: [],
      metadata: {
        sourceDataId: sourceData._id,
        sourceDatasetId: sourceData.datasetId,
        sourceCollectionId: sourceData.collectionId,
        qualityScore: synthesisResult.data?.metadata?.score,
        qualityReason: synthesisResult.data?.metadata?.reason,
        qualityUsages: synthesisResult?.usages,
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
      insertedRecordId: insertedRecord._id
    });

    // TODO: Add audit log
    // TODO: Add tracking metrics

    return {
      success: true,
      insertedRecordId: insertedRecord._id
    };
  } catch (error) {
    addLog.error('Failed to synthesize eval dataset data', {
      dataId,
      evalDatasetCollectionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

// Initialize worker
export const initEvalDatasetDataSynthesizeWorker = () => {
  return getEvalDatasetDataSynthesizeWorker(processor);
};
