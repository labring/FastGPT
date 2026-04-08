import { MongoRerankTrainsetData } from './schema';
import { RerankTrainDataSourceEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import type {
  RerankTrainsetDataSchemaType,
  RerankTrainsetStatistics
} from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

/** Create manual training data */
export async function createManualRerankTrainData(params: {
  trainsetId: string;
  teamId: string;
  tmbId: string;
  query: string;
  positiveDocs: string[];
  negativeDocs: string[];
  reason?: string;
}): Promise<RerankTrainsetDataSchemaType> {
  const { trainsetId, teamId, tmbId, query, positiveDocs, negativeDocs, reason } = params;

  const [doc] = await MongoRerankTrainsetData.create([
    {
      trainsetId,
      teamId,
      query,
      positiveDocs,
      negativeDocs,
      source: RerankTrainDataSourceEnum.manual,
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

  addLog.info('Created manual rerank train data', {
    trainsetId,
    dataId: String(doc._id)
  });

  return doc.toObject() as RerankTrainsetDataSchemaType;
}

/** Update training data */
export async function updateRerankTrainData(params: {
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

  addLog.info('Updated rerank train data', { dataId });
}

/** Delete training data */
export async function deleteRerankTrainData(dataIds: string[]): Promise<number> {
  if (dataIds.length === 0) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const firstData = await MongoRerankTrainsetData.findById(dataIds[0]).lean();
  if (!firstData) {
    return Promise.reject(RerankTrainErrEnum.rerankTrainDataNotExist);
  }

  const result = await MongoRerankTrainsetData.deleteMany({
    _id: { $in: dataIds },
    trainsetId: firstData.trainsetId
  });

  addLog.info('Deleted rerank train data', {
    trainsetId: String(firstData.trainsetId),
    deletedCount: result.deletedCount
  });

  return result.deletedCount || 0;
}

/** Calculate trainset statistics */
export async function calculateRerankTrainsetStats(
  trainsetId: string
): Promise<RerankTrainsetStatistics> {
  const trainData = await MongoRerankTrainsetData.find({ trainsetId }).lean();

  const dataCount = trainData.length;

  let positiveCount = 0;
  let negativeCount = 0;
  trainData.forEach((data) => {
    positiveCount += data.positiveDocs.length;
    negativeCount += data.negativeDocs.length;
  });

  // Use Map to store final data structure directly
  const sourceSummary = new Map<string, RerankTrainsetStatistics['sourceSummary'][number]>();

  trainData.forEach((data) => {
    const source = data.source;

    if (source === RerankTrainDataSourceEnum.dataset) {
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
          RerankTrainsetStatistics['sourceSummary'][number],
          { type: 'dataset' }
        >;
        item.count++;
      }
    } else if (source === RerankTrainDataSourceEnum.chat_log) {
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
          RerankTrainsetStatistics['sourceSummary'][number],
          { type: 'chat_log' }
        >;
        item.count++;
      }
    } else if (source === RerankTrainDataSourceEnum.manual) {
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
          RerankTrainsetStatistics['sourceSummary'][number],
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
