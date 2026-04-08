import type { Processor } from 'bullmq';
import type { EmbeddingTrainDataGenerateJobData } from './mq';
import { MongoEmbeddingTrainsetData } from './schema';
import { MongoEmbeddingTrainset } from '../trainset/schema';
import { sampleDataFromDataset } from '../utils';
import {
  TrainDataSourceEnum,
  EmbeddingTrainsetStatusEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { addLog } from '../../../../common/system/log';
import { synthesizeEmbeddingTrainDatas } from '../external';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../trainset/errors';
import { createEmbeddingEnhancedError } from '../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';

/**
 * Format synthesis indexes to pairs for DiTing API
 *
 * Extracts synthesis-type indexes and pairs them by synId into 2-element arrays.
 * Each data chunk contains 10 synthesis indexes paired into 5 groups.
 *
 * @param indexes - Raw index array (all types)
 * @returns 2D array where each pair contains two texts from the same synId
 */
function formatSynthesisIndexesToPairs(indexes: DatasetDataIndexItemType[]): string[][] {
  if (!indexes || !Array.isArray(indexes) || indexes.length === 0) {
    return [];
  }

  const synthesisIndexes = indexes.filter(
    (idx) => idx.type === DatasetDataIndexTypeEnum.synthesis && idx.synId !== undefined
  );

  const groupedBySynId = new Map<number, string[]>();
  for (const idx of synthesisIndexes) {
    const synId = idx.synId!;
    if (!groupedBySynId.has(synId)) {
      groupedBySynId.set(synId, []);
    }
    groupedBySynId.get(synId)!.push(idx.text);
  }

  const pairs: string[][] = [];
  const sortedSynIds = Array.from(groupedBySynId.keys()).sort((a, b) => a - b);
  for (const synId of sortedSynIds) {
    const texts = groupedBySynId.get(synId)!;
    if (texts.length === 2) {
      pairs.push([texts[0], texts[1]]);
    } else {
      addLog.warn('Unexpected synthesis index count for synId', {
        synId,
        count: texts.length
      });
      if (texts.length > 0) {
        pairs.push(texts.slice(0, 2));
      }
    }
  }

  return pairs;
}

/** Embedding train data generation processor (decoupled from App) */
export const embeddingTrainDataGenerateProcessor: Processor<
  EmbeddingTrainDataGenerateJobData
> = async (job) => {
  const { trainsetId, datasetIds, generateConfig = {} } = job.data;

  // 1. Check if trainset exists
  const trainset = await MongoEmbeddingTrainset.findById(trainsetId);
  if (!trainset) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.trainsetGenNotFound,
      EmbeddingTrainSuggestionEnum.trainsetGenNotFound
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 2. Check if already generating
  if (trainset.status === EmbeddingTrainsetStatusEnum.generating) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.trainsetGenAlreadyGenerating,
      EmbeddingTrainSuggestionEnum.trainsetGenAlreadyGenerating
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 3. datasetIds is now required (from job data directly, no App fallback)
  if (!datasetIds?.length) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.trainsetGenNoDataset,
      EmbeddingTrainSuggestionEnum.trainsetGenNoDataset
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
      source: TrainDataSourceEnum.dataset
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
      EmbeddingTrainErrEnum.trainsetGenDatasetEmpty,
      EmbeddingTrainSuggestionEnum.trainsetGenDatasetEmpty
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
      EmbeddingTrainErrEnum.trainsetGenDitingFailed,
      EmbeddingTrainSuggestionEnum.trainsetGenDitingFailed,
      (ditingError as Error).message
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 6. Check if DiTing returned valid data
  if (!ditingResponse.success || !ditingResponse.data || ditingResponse.data.length === 0) {
    const error = createEmbeddingEnhancedError(
      null,
      EmbeddingTrainErrEnum.trainsetGenDitingNoData,
      EmbeddingTrainSuggestionEnum.trainsetGenDitingNoData,
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
    source: TrainDataSourceEnum.dataset,
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
      EmbeddingTrainErrEnum.trainsetGenDatabaseError,
      EmbeddingTrainSuggestionEnum.trainsetGenDatabaseError,
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
