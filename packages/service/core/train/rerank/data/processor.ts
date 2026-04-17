import type { Processor } from 'bullmq';
import type { RerankTrainDataGenerateJobData } from './mq';
import { MongoRerankTrainsetData } from './schema';
import { MongoRerankTrainset } from '../trainset/schema';
import {
  sampleDataFromDataset,
  createRerankEnhancedError,
  formatSynthesisIndexesToPairs
} from '../utils';
import {
  RerankTrainDataSourceEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { buildFineTuneData } from '../../common/synthesize/buildFineTuneData';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../../common/errors';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';

/** Rerank train data generation processor */
export const rerankTrainDataGenerateProcessor: Processor<RerankTrainDataGenerateJobData> = async (
  job
) => {
  const { trainsetId, datasetIds, generateConfig = {} } = job.data;

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

  // 4. Sample data from datasets
  const samples = await sampleDataFromDataset(targetDatasetIds, {
    datasetType: generateConfig.sampleSize ? 'random' : 'train',
    sampleSize: generateConfig.sampleSize
  });

  if (samples.length === 0) {
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenDatasetEmpty,
      RerankTrainSuggestionEnum.rerankTrainsetGenDatasetEmpty
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
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenDitingNoData,
      RerankTrainSuggestionEnum.rerankTrainsetGenDitingNoData
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 6. Save training data to database (no appId field)
  const trainData = result.samples.map((item) => ({
    trainsetId,
    teamId: trainset.teamId,
    query: item.query,
    positiveDocs: item.positive,
    negativeDocs: item.negatives,
    source: RerankTrainDataSourceEnum.dataset,
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
        await MongoRerankTrainsetData.deleteMany(
          { trainsetId, source: RerankTrainDataSourceEnum.dataset },
          { session }
        );
        await MongoRerankTrainsetData.insertMany(trainData, { session });
      });
    } else {
      await MongoRerankTrainsetData.insertMany(trainData);
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

  // 7. Update trainset status to ready
  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    {
      status: RerankTrainsetStatusEnum.ready,
      updateTime: new Date()
    }
  );

  addLog.info('Generated train data from datasets', {
    trainsetId,
    datasetCount: targetDatasetIds.length,
    dataCount: trainData.length
  });
};
