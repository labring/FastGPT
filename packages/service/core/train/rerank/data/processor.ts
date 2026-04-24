import type { Processor } from 'bullmq';
import type { RerankTrainDataGenerateJobData } from './mq';
import { MongoRerankTrainsetData } from './schema';
import { MongoRerankTrainset } from '../trainset/schema';
import { sampleDataFromDataset, createRerankEnhancedError } from '../utils';
import {
  RerankTrainDataSourceEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { buildFineTuneDataStream } from '../../common/synthesize/buildFineTuneData';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../../common/errors';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { trainEnv } from '../../common/env';

const SAVE_BATCH_SIZE = 1000;

/** Rerank train data generation processor */
export const rerankTrainDataGenerateProcessor: Processor<RerankTrainDataGenerateJobData> = async (
  job
) => {
  const { trainsetId, datasetIds, generateConfig } = job.data;

  // 1. Check if trainset exists
  const trainset = await MongoRerankTrainset.findById(trainsetId);
  if (!trainset) {
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenNotFound,
      RerankTrainSuggestionEnum.rerankTrainsetGenNotFound
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 2. Check if already generating
  if (trainset.status === RerankTrainsetStatusEnum.generating) {
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenAlreadyGenerating,
      RerankTrainSuggestionEnum.rerankTrainsetGenAlreadyGenerating
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 3. datasetIds is now required
  if (!datasetIds?.length) {
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenNoDataset,
      RerankTrainSuggestionEnum.rerankTrainsetGenNoDataset
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  const targetDatasetIds = datasetIds;

  // Update status to generating
  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    { status: RerankTrainsetStatusEnum.generating }
  );

  // 4. Sample data IDs from datasets (lightweight — no q/a/indexes loaded)
  const sampledItems = await sampleDataFromDataset(targetDatasetIds, {
    datasetType: 'train',
    sampleSize: generateConfig.sampleSize,
    weights: generateConfig.weights
  });

  if (sampledItems.length === 0) {
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenDatasetEmpty,
      RerankTrainSuggestionEnum.rerankTrainsetGenDatasetEmpty
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  if (sampledItems.length < trainEnv.TRAIN_MIN_CHUNK_COUNT) {
    addLog.warn('Rerank trainset generation rejected: insufficient chunks after sampling', {
      trainsetId,
      sampledCount: sampledItems.length,
      required: trainEnv.TRAIN_MIN_CHUNK_COUNT
    });
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenInsufficientChunks,
      RerankTrainSuggestionEnum.rerankTrainsetGenInsufficientChunks
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 5. forceRegenerate: delete old data before streaming new data
  if (generateConfig.forceRegenerate) {
    await MongoRerankTrainsetData.deleteMany({
      trainsetId,
      source: RerankTrainDataSourceEnum.dataset
    });
  }

  // 6. Stream training samples and batch-insert
  let saveBatch: any[] = [];
  let totalGenerated = 0;

  try {
    for await (const sample of buildFineTuneDataStream({
      sampledItems,
      indexType: generateConfig.indexType,
      indexMultiStrategy: generateConfig.indexMultiStrategy,
      negativeStrategy: generateConfig.negativeStrategy,
      minNegativeSamples: generateConfig.minNegativeSamples,
      maxNegativeSamples: generateConfig.maxNegativeSamples
    })) {
      saveBatch.push({
        trainsetId,
        teamId: trainset.teamId,
        query: sample.query,
        positiveDocs: sample.positive,
        negativeDocs: sample.negatives,
        source: RerankTrainDataSourceEnum.dataset,
        metadata: {
          sourceInfo: {
            datasetInfo: { dataId: sample.sourceId, datasetId: sample.datasetId }
          },
          generateConfig
        },
        createTime: new Date()
      });
      totalGenerated++;

      if (saveBatch.length >= SAVE_BATCH_SIZE) {
        await MongoRerankTrainsetData.insertMany(saveBatch);
        saveBatch = [];
        await new Promise((r) => setImmediate(r)); // 让 GC 有机会回收上批对象
      }
    }

    if (saveBatch.length > 0) {
      await MongoRerankTrainsetData.insertMany(saveBatch);
    }
  } catch (dbError) {
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenDatabaseError,
      RerankTrainSuggestionEnum.rerankTrainsetGenDatabaseError,
      (dbError as Error).message
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  if (totalGenerated === 0) {
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenDitingNoData,
      RerankTrainSuggestionEnum.rerankTrainsetGenDitingNoData
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 7. Update trainset status to ready
  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    {
      status: RerankTrainsetStatusEnum.ready,
      updateTime: new Date()
    }
  );

  addLog.info('Generated rerank train data from datasets', {
    trainsetId,
    datasetCount: targetDatasetIds.length,
    dataCount: totalGenerated
  });
};
