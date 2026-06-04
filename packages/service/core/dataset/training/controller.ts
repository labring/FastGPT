import { MongoDatasetTraining } from './schema';
import type {
  PushDataChunkType,
  PushDataResponseType
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from '../../../common/mongo';
import { getLLMModel, getEmbeddingModel, getVlmModel, isImageEmbeddingModel } from '../../ai/model';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getLLMMaxChunkSize } from '../../../../global/core/dataset/training/utils';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { checkTimerLock, deleteTimerLock } from '../../../common/system/timerLock/utils';
import { BLOCKED_LOCK_TIME } from './query';

const logger = getLogger(LogCategories.MODULE.DATASET.TRAINING);

export const lockTrainingDataByTeamId = async (
  teamId: string,
  currentTrainingId?: string
): Promise<any> => {
  const timerId = `lock_training_data--${teamId}`;
  const errorMsg = i18nT('common:code_error.team_error.ai_points_not_enough');

  const lockCurrentTraining = () => {
    if (!currentTrainingId) return Promise.resolve();

    return MongoDatasetTraining.updateOne(
      {
        teamId,
        _id: currentTrainingId
      },
      {
        lockTime: BLOCKED_LOCK_TIME,
        errorMsg
      }
    );
  };

  // 5 分钟闸门：并发/多节点调用时，只有首个抢到锁的会执行；TTL 作为兜底
  const acquired = await checkTimerLock({ timerId, lockMinuted: 30 });
  if (!acquired) {
    // 其它 worker 已在执行团队级锁定时，当前已领取任务仍需要单独标记，避免最后一次重试被扣到 0 后不可见。
    await lockCurrentTraining().catch((error) => {
      logger.error('lock current training data failed', { teamId, currentTrainingId, error });
    });
    return;
  }

  try {
    await MongoDatasetTraining.updateMany(
      {
        teamId,
        $or: [
          { retryCount: { $gt: 0 } },
          ...(currentTrainingId ? [{ _id: currentTrainingId }] : [])
        ]
      },
      {
        lockTime: BLOCKED_LOCK_TIME,
        errorMsg
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
  agentModel,
  vectorModel,
  vlmModel,
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

  agentModel: string;
  vectorModel: string;
  vlmModel?: string;

  indexSize?: number;

  billId: string;
  session?: ClientSession;
}): Promise<PushDataResponseType> => {
  const vectorModelData = getEmbeddingModel(vectorModel);
  if (!vectorModelData) {
    return Promise.reject(i18nT('common:error_embedding_not_config'));
  }
  const agentModelData = getLLMModel(agentModel);
  if (!agentModelData) {
    return Promise.reject(i18nT('common:error_llm_not_config'));
  }

  const { maxToken, weight } = await (async () => {
    if (mode === TrainingModeEnum.chunk) {
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
      const vllmModelData = getVlmModel(vlmModel);
      if (!vllmModelData) {
        if (mode === TrainingModeEnum.image && isImageEmbeddingModel(vectorModelData)) {
          return {
            maxToken: Infinity,
            model: vectorModelData.model,
            weight: vectorModelData.weight
          };
        }
        return Promise.reject(i18nT('common:error_vlm_not_config'));
      }
      return {
        maxToken: getLLMMaxChunkSize(vllmModelData),
        model: vllmModelData.model,
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
  const batchSize = 500; // Batch insert size
  const maxBatchesPerTransaction = 20; // Every session can insert at most 20 batches

  const insertDataIterative = async (
    dataToInsert: typeof data,
    session: ClientSession
  ): Promise<number> => {
    let insertedCount = 0;

    for (let i = 0; i < dataToInsert.length; i += batchSize) {
      const batch = dataToInsert.slice(i, i + batchSize);

      if (batch.length === 0) continue;

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
          chunkIndex: item.chunkIndex ?? 0,
          indexSize,
          weight: weight ?? 0,
          indexes: item.indexes,
          retryCount: 5
        })),
        {
          session,
          ordered: true, // 改为 true: 任何失败立即停止,事务回滚
          rawResult: true,
          includeResultMetadata: false
        }
      );

      // ordered: true 模式下,成功必定等于批次大小
      insertedCount += result.insertedCount;

      logger.debug('Training data insert progress', {
        insertedCount,
        total: dataToInsert.length
      });
    }

    return insertedCount;
  };

  // 大数据量分段事务处理 (避免事务超时)
  const chunkSize = maxBatchesPerTransaction * batchSize; // 10,000 条
  const start = Date.now();

  if (data.length > chunkSize) {
    logger.info('Large dataset detected, using chunked transactions', {
      itemCount: data.length,
      chunkSize
    });

    let totalInserted = 0;

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);

      await retryFn(async () => {
        const inserted = await mongoSessionRun(async (chunkSession) => {
          return insertDataIterative(chunk, chunkSession);
        });
        totalInserted += inserted;
      });
    }

    logger.info('Chunked transactions completed', { durationMs: Date.now() - start });

    return { insertLen: totalInserted };
  }

  // 小数据量单事务处理
  if (session) {
    const insertedCount = await insertDataIterative(data, session);
    logger.info('Single transaction completed', { durationMs: Date.now() - start });
    return { insertLen: insertedCount };
  } else {
    const insertedCount = await mongoSessionRun(async (session) => {
      return insertDataIterative(data, session);
    });
    logger.info('Single transaction completed', { durationMs: Date.now() - start });
    return { insertLen: insertedCount };
  }
};

export const pushDatasetToParseQueue = async ({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  billId,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  billId: string;
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
        mode: TrainingModeEnum.parse
      }
    ],
    { session, ordered: true }
  );
};
