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
import { synthesizeRerankTrainDatas } from '../external';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../../common/errors';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';

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

  // Delete old data if force regenerate
  if (generateConfig.forceRegenerate) {
    await MongoRerankTrainsetData.deleteMany({
      trainsetId,
      source: RerankTrainDataSourceEnum.dataset
    });
  }

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

  // 5. Call DiTing service to generate training data
  let ditingResponse;
  try {
    ditingResponse = await synthesizeRerankTrainDatas({
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
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenDitingFailed,
      RerankTrainSuggestionEnum.rerankTrainsetGenDitingFailed,
      (ditingError as Error).message
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 6. Check if DiTing returned valid data
  if (!ditingResponse.success || !ditingResponse.data || ditingResponse.data.length === 0) {
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenDitingNoData,
      RerankTrainSuggestionEnum.rerankTrainsetGenDitingNoData,
      ditingResponse.error
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 7. Save training data to database (no appId field)
  const trainData = ditingResponse.data.map((item) => ({
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
    await MongoRerankTrainsetData.insertMany(trainData);
  } catch (dbError) {
    const error = createRerankEnhancedError(
      null,
      RerankTrainErrEnum.rerankTrainsetGenDatabaseError,
      RerankTrainSuggestionEnum.rerankTrainsetGenDatabaseError,
      (dbError as Error).message
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 8. Update trainset status to ready
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
