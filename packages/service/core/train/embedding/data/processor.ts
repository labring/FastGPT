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
import { synthesizeEmbeddingTrainDatas } from '../external';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../../common/errors';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';

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

  // Delete old data if force regenerate
  if (generateConfig.forceRegenerate) {
    await MongoEmbeddingTrainsetData.deleteMany({
      trainsetId,
      source: EmbeddingTrainDataSourceEnum.dataset
    });
  }

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

  // 5. Call DiTing service to generate training data
  let ditingResponse;
  try {
    ditingResponse = await synthesizeEmbeddingTrainDatas({
      samples: samples.map((s) => ({
        datasetId: s.datasetId,
        dataId: s.dataId,
        q: s.q,
        a: s.a,
        indexes: formatSynthesisIndexesToPairs(s.indexes)
      })),
      config: generateConfig
    });
  } catch (ditingError) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenDitingFailed,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenDitingFailed,
      (ditingError as Error).message
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 6. Check if DiTing returned valid data
  if (!ditingResponse.success || !ditingResponse.data || ditingResponse.data.length === 0) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenDitingNoData,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenDitingNoData,
      ditingResponse.error
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 7. Save training data to database
  const trainData = ditingResponse.data.map((item) => ({
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
    await MongoEmbeddingTrainsetData.insertMany(trainData);
  } catch (dbError) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.embeddingTrainsetGenDatabaseError,
      EmbeddingTrainSuggestionEnum.embeddingTrainsetGenDatabaseError,
      (dbError as Error).message
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 8. Update trainset status to ready
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
