import { MongoEmbeddingTrainsetData } from './schema';
import { EmbeddingTrainDataSourceEnum } from '@fastgpt/global/core/train/embedding/constants';
import { addLog } from '../../../../common/system/log';
import type {
  EmbeddingTrainsetDataSchemaType,
  EmbeddingTrainsetStatistics
} from '@fastgpt/global/core/train/embedding/type';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

/** Create manual training data */
export async function createManualEmbeddingTrainData(params: {
  trainsetId: string;
  teamId: string;
  tmbId: string;
  query: string;
  positiveDocs: string[];
  negativeDocs: string[];
  reason?: string;
}): Promise<EmbeddingTrainsetDataSchemaType> {
  const { trainsetId, teamId, tmbId, query, positiveDocs, negativeDocs, reason } = params;

  const [doc] = await MongoEmbeddingTrainsetData.create([
    {
      trainsetId,
      teamId,
      query,
      positiveDocs,
      negativeDocs,
      source: EmbeddingTrainDataSourceEnum.manual,
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

  addLog.info('Created manual embedding train data', {
    trainsetId,
    dataId: String(doc._id)
  });

  return doc.toObject() as EmbeddingTrainsetDataSchemaType;
}

/** Update training data */
export async function updateEmbeddingTrainData(params: {
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

  await MongoEmbeddingTrainsetData.updateOne({ _id: dataId }, updateFields);

  addLog.info('Updated embedding train data', { dataId });
}

/** Delete training data */
export async function deleteEmbeddingTrainData(dataIds: string[]): Promise<number> {
  if (dataIds.length === 0) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const firstData = await MongoEmbeddingTrainsetData.findById(dataIds[0]).lean();
  if (!firstData) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainDataNotExist);
  }

  const result = await MongoEmbeddingTrainsetData.deleteMany({
    _id: { $in: dataIds },
    trainsetId: firstData.trainsetId
  });

  addLog.info('Deleted embedding train data', {
    trainsetId: String(firstData.trainsetId),
    deletedCount: result.deletedCount
  });

  return result.deletedCount || 0;
}

/** Calculate embedding trainset statistics */
export async function calculateEmbeddingTrainsetStats(
  trainsetId: string
): Promise<EmbeddingTrainsetStatistics> {
  const trainData = await MongoEmbeddingTrainsetData.find({ trainsetId }).lean();

  const dataCount = trainData.length;

  let positiveCount = 0;
  let negativeCount = 0;
  trainData.forEach((data) => {
    positiveCount += data.positiveDocs.length;
    negativeCount += data.negativeDocs.length;
  });

  // Use Map to store final data structure directly
  const sourceSummary = new Map<string, EmbeddingTrainsetStatistics['sourceSummary'][number]>();

  trainData.forEach((data) => {
    const source = data.source;

    if (source === EmbeddingTrainDataSourceEnum.dataset) {
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
          EmbeddingTrainsetStatistics['sourceSummary'][number],
          { type: 'dataset' }
        >;
        item.count++;
      }
    } else if (source === EmbeddingTrainDataSourceEnum.chat_log) {
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
          EmbeddingTrainsetStatistics['sourceSummary'][number],
          { type: 'chat_log' }
        >;
        item.count++;
      }
    } else if (source === EmbeddingTrainDataSourceEnum.manual) {
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
          EmbeddingTrainsetStatistics['sourceSummary'][number],
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
