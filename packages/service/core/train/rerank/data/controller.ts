import { MongoRerankTrainsetData } from './schema';
import { MongoRerankTrainset } from '../trainset/schema';
import { MongoApp } from '../../../app/schema';
import { extractDatasetIdsFromApp, sampleDataFromDataset } from '../utils';
import type { RerankTrainDataGenerateConfig } from './mq';
import type { TrainsetStatistics } from '@fastgpt/global/core/train/rerank/type';
import {
  TrainDataSourceEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { syntheticRerankTrainDatas } from '../external';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';

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

/** Create manual training data */
export async function createManualTrainData(params: {
  trainsetId: string;
  appId: string;
  teamId: string;
  tmbId: string;
  query: string;
  positiveDocs: string[];
  negativeDocs: string[];
  reason?: string;
}): Promise<string> {
  const { trainsetId, appId, teamId, tmbId, query, positiveDocs, negativeDocs, reason } = params;

  const [{ _id }] = await MongoRerankTrainsetData.create([
    {
      trainsetId,
      appId,
      teamId,
      query,
      positiveDocs,
      negativeDocs,
      source: TrainDataSourceEnum.manual,
      metadata: {
        sourceInfo: {
          manualInfo: {
            creator: tmbId,
            createdAt: new Date(),
            reason
          }
        }
      }
    }
  ]);

  addLog.info('Created manual train data', {
    trainsetId,
    dataId: String(_id)
  });

  return String(_id);
}

/** Update training data */
export async function updateTrainData(params: {
  dataId: string;
  query?: string;
  positiveDocs?: string[];
  negativeDocs?: string[];
}): Promise<void> {
  const { dataId, query, positiveDocs, negativeDocs } = params;

  const updateFields: {
    query?: string;
    positiveDocs?: string[];
    negativeDocs?: string[];
  } = {};
  if (query) updateFields.query = query;
  if (positiveDocs) updateFields.positiveDocs = positiveDocs;
  if (negativeDocs) updateFields.negativeDocs = negativeDocs;

  await MongoRerankTrainsetData.updateOne({ _id: dataId }, updateFields);

  addLog.info('Updated train data', { dataId });
}

/** Delete training data */
export async function deleteTrainData(dataIds: string[]): Promise<number> {
  if (dataIds.length === 0) {
    throw new Error('dataIds is empty');
  }

  const firstData = await MongoRerankTrainsetData.findById(dataIds[0]).lean();
  if (!firstData) {
    throw new Error('Train data not found');
  }

  const result = await MongoRerankTrainsetData.deleteMany({
    _id: { $in: dataIds },
    trainsetId: firstData.trainsetId
  });

  addLog.info('Deleted train data', {
    trainsetId: String(firstData.trainsetId),
    deletedCount: result.deletedCount
  });

  return result.deletedCount || 0;
}

/** Calculate trainset statistics */
export async function calculateTrainsetStats(trainsetId: string): Promise<TrainsetStatistics> {
  const trainData = await MongoRerankTrainsetData.find({ trainsetId }).lean();

  const dataCount = trainData.length;

  let positiveCount = 0;
  let negativeCount = 0;
  trainData.forEach((data) => {
    positiveCount += data.positiveDocs.length;
    negativeCount += data.negativeDocs.length;
  });

  // Use Map to store final data structure directly
  const sourceSummary = new Map<string, TrainsetStatistics['sourceSummary'][number]>();

  trainData.forEach((data) => {
    const source = data.source;

    if (source === TrainDataSourceEnum.dataset) {
      const datasetId = data.metadata?.sourceInfo?.datasetInfo?.datasetId;

      if (datasetId) {
        const key = `dataset_${datasetId}`;
        if (!sourceSummary.has(key)) {
          sourceSummary.set(key, {
            type: 'dataset' as const,
            count: 0,
            datasetInfo: {
              datasetId
            }
          });
        }
        // Type assertion needed because TypeScript can't narrow discriminated union in Map.get()
        const item = sourceSummary.get(key) as Extract<
          TrainsetStatistics['sourceSummary'][number],
          { type: 'dataset' }
        >;
        item.count++;
      }
    } else if (source === TrainDataSourceEnum.chat_log) {
      const chatId = data.metadata?.sourceInfo?.chatLogInfo?.chatId;

      if (chatId) {
        const key = `chat_log_${chatId}`;
        if (!sourceSummary.has(key)) {
          sourceSummary.set(key, {
            type: 'chat_log' as const,
            count: 0,
            chatLogInfo: {
              chatId
            }
          });
        }
        const item = sourceSummary.get(key) as Extract<
          TrainsetStatistics['sourceSummary'][number],
          { type: 'chat_log' }
        >;
        item.count++;
      }
    } else if (source === TrainDataSourceEnum.manual) {
      const creator = data.metadata?.sourceInfo?.manualInfo?.creator;

      if (creator) {
        const key = `manual_${creator}`;
        if (!sourceSummary.has(key)) {
          sourceSummary.set(key, {
            type: 'manual' as const,
            count: 0,
            manualInfo: {
              creator
            }
          });
        }
        const item = sourceSummary.get(key) as Extract<
          TrainsetStatistics['sourceSummary'][number],
          { type: 'manual' }
        >;
        item.count++;
      }
    }
  });

  return {
    dataCount,
    positiveCount,
    negativeCount,
    sourceSummary: Array.from(sourceSummary.values())
  };
}

/**
 * Generate training data from app's associated datasets
 *
 * Samples dataset chunks and calls DiTing service to generate synthetic training pairs.
 * By default uses first 80% of dataset data for training data generation.
 *
 * @param params - Generation parameters
 * @param params.appId - Application ID
 * @param params.trainsetId - Trainset ID
 * @param params.datasetIds - Optional dataset IDs (defaults to all datasets from app)
 * @param params.generateConfig - Optional generation config (sampleSize, forceRegenerate, etc.)
 * @throws {Error} When trainset not found, app not found, or generation fails
 */
export async function generateAppTrainsetDataCore(params: {
  appId: string;
  trainsetId: string;
  datasetIds?: string[];
  generateConfig?: RerankTrainDataGenerateConfig;
}): Promise<void> {
  const { appId, trainsetId, datasetIds, generateConfig = {} } = params;

  const trainset = await MongoRerankTrainset.findById(trainsetId);
  if (!trainset) {
    throw new Error('Trainset not found');
  }

  if (trainset.status === RerankTrainsetStatusEnum.generating) {
    throw new Error('Trainset is currently generating');
  }

  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new Error('App not found');
  }

  const targetDatasetIds = datasetIds?.length ? datasetIds : extractDatasetIdsFromApp(app);

  if (!targetDatasetIds.length) {
    throw new Error('No datasets found for this app');
  }

  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    { status: RerankTrainsetStatusEnum.generating }
  );

  try {
    if (generateConfig.forceRegenerate) {
      await MongoRerankTrainsetData.deleteMany({
        trainsetId,
        source: TrainDataSourceEnum.dataset
      });
    }

    const samples = await sampleDataFromDataset(targetDatasetIds, {
      datasetType: generateConfig.sampleSize ? 'random' : 'train',
      sampleSize: generateConfig.sampleSize
    });

    if (samples.length === 0) {
      throw new Error('No data available in dataset');
    }

    const ditingResponse = await syntheticRerankTrainDatas({
      samples: samples.map((s) => ({
        datasetId: s.datasetId,
        dataId: s.dataId,
        q: s.q,
        a: s.a,
        indexes: formatSynthesisIndexesToPairs(s.indexes)
      })),
      config: generateConfig
    });

    if (!ditingResponse.success || !ditingResponse.data) {
      throw new Error(ditingResponse.error || 'DiTing service failed');
    }

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

    await MongoRerankTrainsetData.insertMany(appTrainData);

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
  } catch (error) {
    await MongoRerankTrainset.updateOne(
      { _id: trainsetId },
      {
        status: RerankTrainsetStatusEnum.error,
        errorMsg: (error as Error).message,
        updateTime: new Date()
      }
    );
    throw error;
  }
}
