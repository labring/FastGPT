import type { Processor } from 'bullmq';
import type { RerankTrainDataGenerateJobData } from './mq';
import { MongoRerankTrainsetData } from './schema';
import { MongoRerankTrainset } from '../trainset/schema';
import { MongoApp } from '../../../app/schema';
import { extractDatasetIdsFromApp, sampleDataFromDataset } from '../utils';
import {
  TrainDataSourceEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { syntheticRerankTrainDatas } from '../external';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../trainset/errors';
import { createEnhancedError } from '../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
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

/** Rerank train data generation processor */
export const rerankTrainDataGenerateProcessor: Processor<RerankTrainDataGenerateJobData> = async (
  job
) => {
  const { appId, trainsetId, datasetIds, generateConfig = {} } = job.data;

  // 1. Check if trainset exists
  const trainset = await MongoRerankTrainset.findById(trainsetId);
  if (!trainset) {
    const error = createEnhancedError(
      null,
      RerankTrainErrEnum.trainsetGenNotFound,
      RerankTrainSuggestionEnum.trainsetGenNotFound
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 2. Check if already generating
  if (trainset.status === RerankTrainsetStatusEnum.generating) {
    const error = createEnhancedError(
      null,
      RerankTrainErrEnum.trainsetGenAlreadyGenerating,
      RerankTrainSuggestionEnum.trainsetGenAlreadyGenerating
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 3. Check if app exists
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    const error = createEnhancedError(
      null,
      RerankTrainErrEnum.trainsetGenAppDeleted,
      RerankTrainSuggestionEnum.trainsetGenAppDeleted
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 4. Check if app has datasets configured
  const targetDatasetIds = datasetIds?.length ? datasetIds : extractDatasetIdsFromApp(app);

  if (!targetDatasetIds.length) {
    const error = createEnhancedError(
      null,
      RerankTrainErrEnum.trainsetGenNoDataset,
      RerankTrainSuggestionEnum.trainsetGenNoDataset
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // Update status to generating
  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    { status: RerankTrainsetStatusEnum.generating }
  );

  // Delete old data if force regenerate
  if (generateConfig.forceRegenerate) {
    await MongoRerankTrainsetData.deleteMany({
      trainsetId,
      source: TrainDataSourceEnum.dataset
    });
  }

  // 5. Sample data from datasets
  const samples = await sampleDataFromDataset(targetDatasetIds, {
    datasetType: generateConfig.sampleSize ? 'random' : 'train',
    sampleSize: generateConfig.sampleSize
  });

  if (samples.length === 0) {
    const error = createEnhancedError(
      null,
      RerankTrainErrEnum.trainsetGenDatasetEmpty,
      RerankTrainSuggestionEnum.trainsetGenDatasetEmpty
    );
    throw new TrainsetGenerationUnrecoverableError(error);
  }

  // 6. Call DiTing service to generate training data
  let ditingResponse;
  try {
    ditingResponse = await syntheticRerankTrainDatas({
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
    const error = createEnhancedError(
      null,
      RerankTrainErrEnum.trainsetGenDitingFailed,
      RerankTrainSuggestionEnum.trainsetGenDitingFailed,
      (ditingError as Error).message
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 7. Check if DiTing returned valid data
  if (!ditingResponse.success || !ditingResponse.data || ditingResponse.data.length === 0) {
    const error = createEnhancedError(
      null,
      RerankTrainErrEnum.trainsetGenDitingNoData,
      RerankTrainSuggestionEnum.trainsetGenDitingNoData,
      ditingResponse.error
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 8. Save training data to database
  const appTrainData = ditingResponse.data.map((item) => ({
    trainsetId,
    appId,
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
    await MongoRerankTrainsetData.insertMany(appTrainData);
  } catch (dbError) {
    const error = createEnhancedError(
      null,
      RerankTrainErrEnum.trainsetGenDatabaseError,
      RerankTrainSuggestionEnum.trainsetGenDatabaseError,
      (dbError as Error).message
    );
    throw new TrainsetGenerationRetriableError(error);
  }

  // 9. Update trainset status to ready
  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    {
      status: RerankTrainsetStatusEnum.ready,
      updateTime: new Date()
    }
  );

  addLog.info('Generated app train data from datasets', {
    appId,
    trainsetId,
    datasetCount: targetDatasetIds.length,
    dataCount: appTrainData.length
  });
};
