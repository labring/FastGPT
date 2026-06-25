import { MongoDatasetTraining } from './schema';
import type {
  PushDataChunkType,
  PushDataResponseType
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from '../../../common/mongo';
import { getLLMModelById, getEmbeddingModelById, getVlmModelById } from '../../ai/model';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { i18nT } from '../../../../global/common/i18n/utils';
import { getLLMMaxChunkSize } from '../../../../global/core/dataset/training/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { checkTimerLock, deleteTimerLock } from '../../../common/system/timerLock/utils';
import { pushCollectionUpdateJob } from '../collection/mq';

const logger = getLogger(LogCategories.MODULE.DATASET.TRAINING);

export const lockTrainingDataByTeamId = async (teamId: string): Promise<any> => {
  const timerId = `lock_training_data--${teamId}`;

  // 5 分钟闸门：并发/多节点调用时，只有首个抢到锁的会执行；TTL 作为兜底
  const acquired = await checkTimerLock({ timerId, lockMinuted: 30 });
  if (!acquired) return;

  try {
    await MongoDatasetTraining.updateMany(
      {
        teamId
      },
      {
        lockTime: new Date('2999/5/5')
      }
    );
  } catch (error) {
    logger.error('lockTrainingDataByTeamId failed', { teamId, error });
  } finally {
    // 执行完立即释放锁
    await deleteTimerLock({ timerId }).catch(() => {});
  }
};

export const pushDataListToTrainingQueue = async ({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  agentModelId,
  vectorModelId,
  vlmModelId,
  data,
  billId,
  mode = TrainingModeEnum.chunk,
  indexSize,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;

  data: PushDataChunkType[];
  mode?: TrainingModeEnum;

  agentModelId: string;
  vectorModelId: string;
  vlmModelId?: string;

  indexSize?: number;

  billId: string;
  session?: ClientSession;
}): Promise<PushDataResponseType> => {
  // ✅ 双向互斥检查 (1/2): 训练入口检查是否有同义词处理任务
  // 说明: 此检查确保 chunk/qa/auto 等训练任务不会与 synonymStandardize/synonymRestore 并发
  // 配合 uploadSynonymFile/deleteSynonymFile 中的反向检查，保证同一知识库同一时刻只有一种操作
  const hasSynonymTask = await MongoDatasetTraining.exists({
    teamId: teamId,
    datasetId: datasetId,
    mode: {
      $in: [TrainingModeEnum.synonymStandardize, TrainingModeEnum.synonymRestore]
    },
    retryCount: { $gt: 0 }
  });

  if (hasSynonymTask) {
    throw new Error('知识库正在进行同义词处理,请等待处理完成后再训练');
  }

  const vectorModelData = getEmbeddingModelById(vectorModelId);
  if (!vectorModelData) {
    return Promise.reject(i18nT('common:error_embedding_not_config'));
  }
  const agentModelData = getLLMModelById(agentModelId);
  if (!agentModelData) {
    return Promise.reject(i18nT('common:error_llm_not_config'));
  }

  const { model, maxToken, weight } = await (async () => {
    if (mode === TrainingModeEnum.chunk || mode === TrainingModeEnum.small2Big) {
      return {
        maxToken: Infinity,
        model: vectorModelData.model,
        weight: vectorModelData.weight
      };
    }
    if (mode === TrainingModeEnum.qa || mode === TrainingModeEnum.auto) {
      return {
        maxToken: getLLMMaxChunkSize(agentModelData),
        model: agentModelData.model,
        weight: 0
      };
    }
    if (mode === TrainingModeEnum.image || mode === TrainingModeEnum.imageParse) {
      const vlmModelData = getVlmModelById(vlmModelId);
      if (!vlmModelData) {
        // imageParse mode can use customPdfParse service instead of VLM
        const hasCustomPdfParse =
          mode === TrainingModeEnum.imageParse &&
          !!global.systemEnv?.customPdfParse?.url &&
          !!global.systemEnv?.customPdfParse?.key;
        if (!hasCustomPdfParse) {
          return Promise.reject(i18nT('common:error_vlm_not_config'));
        }
        return {
          maxToken: getLLMMaxChunkSize(agentModelData),
          model: agentModelData.model,
          weight: 0
        };
      }
      return {
        maxToken: getLLMMaxChunkSize(vlmModelData),
        model: vlmModelData.model,
        weight: 0
      };
    }

    return Promise.reject(`Training mode "${mode}" is inValid`);
  })();

  // format q and a, remove empty char
  data = data.filter((item) => {
    const q = item.q || '';
    const a = item.a || '';

    // filter repeat content
    if (!item.imageId && !q) {
      return;
    }

    const text = q + a;

    // Oversize llm tokens
    if (text.length > maxToken) {
      return;
    }

    return true;
  });

  // insert data to db
  const batchSize = 500;

  const insertBatch = async (batch: typeof data, batchSession: ClientSession): Promise<number> => {
    if (batch.length === 0) return 0;

    const result = await MongoDatasetTraining.insertMany(
      batch.map((item) => ({
        teamId,
        tmbId,
        datasetId,
        collectionId,
        billId,
        mode,
        ...(item.q && { q: item.q }),
        ...(item.a && { a: item.a }),
        ...(item.imageId && { imageId: item.imageId }),
        ...(item.id && { dataId: item.id }),
        chunkIndex: item.chunkIndex ?? 0,
        indexSize,
        weight: weight ?? 0,
        indexes: item.indexes,
        ...(item.metadata && { dataMetadata: item.metadata }),
        retryCount: 5
      })),
      {
        session: batchSession,
        ordered: true,
        rawResult: true,
        includeResultMetadata: false
      }
    );

    return result.insertedCount;
  };

  let start = Date.now();
  let insertedCount = 0;

  if (session) {
    // Caller's session: all batches share one transaction (backward compatible)
    for (let i = 0; i < data.length; i += batchSize) {
      insertedCount += await insertBatch(data.slice(i, i + batchSize), session);
      logger.debug('Training batch progress (shared session)', {
        insertedCount,
        total: data.length
      });
    }
    logger.info('Training inserts completed (shared session)', {
      durationMs: Date.now() - start,
      insertedCount
    });
  } else {
    // No session: each batch is its own independent transaction
    for (let i = 0; i < data.length; i += batchSize) {
      const batchCount = await mongoSessionRun(async (batchSession) => {
        return insertBatch(data.slice(i, i + batchSize), batchSession);
      });
      insertedCount += batchCount;
      logger.debug('Training batch committed (per-batch txn)', {
        done: i + batchSize,
        total: data.length,
        insertedCount
      });
    }
    logger.info('Training inserts completed (per-batch txns)', {
      durationMs: Date.now() - start,
      insertedCount
    });
  }

  pushCollectionUpdateJob({
    collectionId: String(collectionId),
    datasetId: String(datasetId),
    teamId: String(teamId)
  });

  return { insertLen: insertedCount };
};

export const pushDatasetToParseQueue = async ({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  billId,
  useGpuQueue,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  billId: string;
  useGpuQueue?: boolean;
  session: ClientSession;
}) => {
  await MongoDatasetTraining.create(
    [
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.parse,
        useGpuQueue: !!useGpuQueue
      }
    ],
    { session, ordered: true }
  );

  pushCollectionUpdateJob({
    collectionId: String(collectionId),
    datasetId: String(datasetId),
    teamId: String(teamId)
  });
};
