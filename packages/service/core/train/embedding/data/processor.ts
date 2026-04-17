import type { Processor } from 'bullmq';
import type { EmbeddingTrainDataGenerateJobData } from './mq';
import { MongoEmbeddingTrainsetData } from './schema';
import { MongoEmbeddingTrainset } from '../trainset/schema';
import {
  sampleDataFromDataset,
  createEmbeddingEnhancedError,
  formatSynthesisIndexesToPairs
} from '../utils';
import {
  EmbeddingTrainDataSourceEnum,
  EmbeddingTrainsetStatusEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { addLog } from '../../../../common/system/log';
import { buildFineTuneData } from '../../common/synthesize/buildFineTuneData';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../../common/errors';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';

/** Embedding train data generation processor */
export const embeddingTrainDataGenerateProcessor: Processor<
  EmbeddingTrainDataGenerateJobData
> = async (job) => {
  const { trainsetId, datasetIds, generateConfig = {} } = job.data;

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

  // 4. Sample data from datasets
  const samples = await sampleDataFromDataset(targetDatasetIds, {
    datasetType: generateConfig.sampleSize ? 'random' : 'train',
    sampleSize: generateConfig.sampleSize
  });

  if (samples.length === 0) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenDatasetEmpty,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenDatasetEmpty
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 5. Generate training data
  const result = buildFineTuneData({
    items: samples.map((s) => ({
      dataId: s.dataId,
      datasetId: s.datasetId,
      q: s.q,
      a: s.a,
      indexes: formatSynthesisIndexesToPairs(s.indexes)
    })),
    minNegativeSamples: generateConfig.minNegativeSamples,
    maxNegativeSamples: generateConfig.maxNegativeSamples,
    includeOriginalQ: generateConfig.includeOriginalQ
  });

  if (result.samples.length === 0) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenDitingNoData,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenDitingNoData
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 6. Save training data to database
  const trainData = result.samples.map((item) => ({
    trainsetId,
    teamId: trainset.teamId,
    query: item.query,
    positiveDocs: item.positive,
    negativeDocs: item.negatives,
    source: EmbeddingTrainDataSourceEnum.dataset,
    metadata: {
      sourceInfo: {
        datasetInfo: {
          dataId: item.sourceId,
          datasetId: item.datasetId
        }
      },
      generateConfig: generateConfig
    },
    createTime: new Date()
  }));

  try {
    if (generateConfig.forceRegenerate) {
      // Atomically delete old data and insert new data.
      // Deleting after generation succeeds means sampling/build failures cannot destroy existing data.
      // The transaction guarantees that a DB failure during delete/insert rolls back both operations,
      // keeping old data intact so the next retry can succeed.
      await mongoSessionRun(async (session) => {
        await MongoEmbeddingTrainsetData.deleteMany(
          { trainsetId, source: EmbeddingTrainDataSourceEnum.dataset },
          { session }
        );
        await MongoEmbeddingTrainsetData.insertMany(trainData, { session });
      });
    } else {
      await MongoEmbeddingTrainsetData.insertMany(trainData);
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
    dataCount: trainData.length
  });
};
