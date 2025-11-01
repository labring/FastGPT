import { MongoDatasetTraining } from './schema';
import type { PushDatasetDataResponse } from '@fastgpt/global/core/dataset/api.d';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from '../../../common/mongo';
import { getLLMModel, getEmbeddingModel, getVlmModel } from '../../ai/model';
import { addLog } from '../../../common/system/log';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { type PushDataToTrainingQueueProps } from '@fastgpt/global/core/dataset/training/type';
import { i18nT } from '../../../../web/i18n/utils';
import { getLLMMaxChunkSize } from '../../../../global/core/dataset/training/utils';
import { retryFn } from '@fastgpt/global/common/system/utils';

export const lockTrainingDataByTeamId = async (teamId: string): Promise<any> => {
  try {
    await MongoDatasetTraining.updateMany(
      {
        teamId
      },
      {
        lockTime: new Date('2999/5/5')
      }
    );
  } catch (error) {}
};

export async function pushDataListToTrainingQueue({
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
}: PushDataToTrainingQueueProps): Promise<PushDatasetDataResponse> {
  const vectorModelData = getEmbeddingModel(vectorModel);
  if (!vectorModelData) {
    return Promise.reject(i18nT('common:error_embedding_not_config'));
  }
  const agentModelData = getLLMModel(agentModel);
  if (!agentModelData) {
    return Promise.reject(i18nT('common:error_llm_not_config'));
  }

  const { model, maxToken, weight } = await (async () => {
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

      addLog.debug(`Training data insert progress: ${insertedCount}/${dataToInsert.length}`);
    }

    return insertedCount;
  };

  // 大数据量分段事务处理 (避免事务超时)
  const chunkSize = maxBatchesPerTransaction * batchSize; // 10,000 条
  let start = Date.now();

  if (data.length > chunkSize) {
    addLog.info(`Large dataset detected (${data.length} items), using chunked transactions`);

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

    addLog.info(`Chunked transactions completed in ${Date.now() - start}ms`);

    return { insertLen: totalInserted };
  }

  // 小数据量单事务处理
  if (session) {
    const insertedCount = await insertDataIterative(data, session);
    addLog.info(`Single transaction completed in ${Date.now() - start}ms`);
    return { insertLen: insertedCount };
  } else {
    const insertedCount = await mongoSessionRun(async (session) => {
      return insertDataIterative(data, session);
    });
    addLog.info(`Single transaction completed in ${Date.now() - start}ms`);
    return { insertLen: insertedCount };
  }
}

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
