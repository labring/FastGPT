import type { Processor } from 'bullmq';
import type { EmbeddingTrainDataGenerateJobData } from './mq';
import { MongoEmbeddingTrainsetData } from './schema';
import { MongoEmbeddingTrainset } from '../trainset/schema';
import { sampleDataFromDataset, createEmbeddingEnhancedError } from '../utils';
import {
  EmbeddingTrainDataSourceEnum,
  EmbeddingTrainsetStatusEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { addLog } from '../../../../common/system/log';
import { buildFineTuneDataStream } from '../../common/synthesize/buildFineTuneData';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../../common/errors';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';

const SAVE_BATCH_SIZE = 1000;

/** Embedding train data generation processor */
export const embeddingTrainDataGenerateProcessor: Processor<
  EmbeddingTrainDataGenerateJobData
> = async (job) => {
  const { trainsetId, datasetIds, generateConfig } = job.data;

  // 1. Check if trainset exists
  const trainset = await MongoEmbeddingTrainset.findById(trainsetId);
  if (!trainset) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenNotFound,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenNotFound
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 2. Check if already generating
  if (trainset.status === EmbeddingTrainsetStatusEnum.generating) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenAlreadyGenerating,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenAlreadyGenerating
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 3. datasetIds is required
  if (!datasetIds?.length) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenNoDataset,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenNoDataset
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  const targetDatasetIds = datasetIds;

  // Update status to generating
  await MongoEmbeddingTrainset.updateOne(
    { _id: trainsetId },
    { status: EmbeddingTrainsetStatusEnum.generating }
  );

  // 4. Sample data IDs from datasets (lightweight — no q/a/indexes loaded)
  const sampledItems = await sampleDataFromDataset(targetDatasetIds, {
    datasetType: 'train',
    sampleSize: generateConfig.sampleSize,
    weights: generateConfig.weights
  });

  if (sampledItems.length === 0) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenDatasetEmpty,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenDatasetEmpty
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 5. forceRegenerate: delete old data before streaming new data
  if (generateConfig.forceRegenerate) {
    await MongoEmbeddingTrainsetData.deleteMany({
      trainsetId,
      source: EmbeddingTrainDataSourceEnum.dataset
    });
  }

  // 6. Stream training samples and batch-insert
  let saveBatch: any[] = [];
  let totalGenerated = 0;

  try {
    for await (const sample of buildFineTuneDataStream({
      sampledItems,
      indexType: generateConfig.indexType,
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
        source: EmbeddingTrainDataSourceEnum.dataset,
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
        await MongoEmbeddingTrainsetData.insertMany(saveBatch);
        saveBatch = [];
        await new Promise((r) => setImmediate(r)); // 让 GC 有机会回收上批对象
      }
    }

    if (saveBatch.length > 0) {
      await MongoEmbeddingTrainsetData.insertMany(saveBatch);
    }
  } catch (dbError) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenDatabaseError,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenDatabaseError,
      (dbError as Error).message
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  if (totalGenerated === 0) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenDitingNoData,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenDitingNoData
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 7. Update trainset status to ready
  await MongoEmbeddingTrainset.updateOne(
    { _id: trainsetId },
    {
      status: EmbeddingTrainsetStatusEnum.ready,
      updateTime: new Date()
    }
  );

  addLog.info('Generated embedding train data from datasets', {
    trainsetId,
    datasetCount: targetDatasetIds.length,
    dataCount: totalGenerated
  });
};
