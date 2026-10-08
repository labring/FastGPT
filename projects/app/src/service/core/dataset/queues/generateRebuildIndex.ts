import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';

import { updateDatasetDataByIndexes } from '@/service/core/dataset/data/data';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

import { getMaxIndexSize } from '@fastgpt/global/core/dataset/training/utils';
import type {
  DatasetDataSchemaType,
  DatasetSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { delay, retryFn } from '@fastgpt/global/common/system/utils';
import { getRebuildUpdateInput } from './indexInput';
import { enqueueNextDatasetRebuildTask } from './rebuild';
import { isDatasetSynonymEnabled } from '@fastgpt/service/core/dataset/synonym/entity';
import {
  claimTrainingTask,
  TrainingLeaseLostError,
  type TrainingTaskLease
} from '@fastgpt/service/core/dataset/training/service';

const logger = getLogger(LogCategories.MODULE.DATASET.EMBEDDING);

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

type PopulateType = {
  dataset: Pick<DatasetSchemaType, 'vectorModelId' | 'vectorModel' | 'vlmModelId' | 'vlmModel'>;
  collection: { name: string; indexPrefixTitle: boolean; imageIndex?: boolean };
  data?: {
    _id: string;
    q: string;
    a?: string;
    imageId?: string;
    indexes: DatasetDataSchemaType['indexes'];
  };
};
type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

/** 消费已有数据的重建任务；每条任务独立管理心跳，队列退出时归还并发名额。 */
export async function generateRebuildIndex(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
  logger.debug('Vector queue size check', { queueSize: global.vectorQueueLen, max });

  if (global.vectorQueueLen + global.preCreatedQueueLen >= max) return;
  global.vectorQueueLen++;

  try {
    while (true) {
      const start = Date.now();

      // get training data
      let claimed;
      try {
        claimed = await claimTrainingTask<PopulateType>({
          mode: TrainingModeEnum.rebuild,
          filter: {
            ...(!isDatasetSynonymEnabled() && {
              synonymVersion: { $exists: false }
            })
          },
          populate: [
            {
              path: 'dataset',
              select: 'vectorModelId vectorModel vlmModelId vlmModel'
            },
            {
              path: 'collection',
              select: 'name indexPrefixTitle imageIndex'
            },
            {
              path: 'data',
              select: '_id q a imageId indexes'
            }
          ]
        });
      } catch (error) {
        logger.error('Vector queue fetch task failed', { error });
        await delay(500);
        continue;
      }

      // Break loop
      if (!claimed) {
        break;
      }
      const { data, lease } = claimed;
      try {
        lease.start();

        if (!data.dataset || !data.collection) {
          logger.info('Vector queue task skipped: dataset or collection missing', {
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            trainingId: data._id
          });
          // 当前集合被删除也必须续接数据集内其他集合的重建，避免种子任务全部跳过后断链。
          if (data.dataset && data.dataId) {
            await enqueueFollowingDatasetRebuild({ trainingData: data });
          }
          await lease.complete();
          continue;
        }

        // auth balance
        if (!(await checkTeamAiPointsAndLock(data.teamId, String(data._id)))) {
          continue;
        }

        logger.info('Vector queue task started', {
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          teamId: data.teamId,
          tmbId: data.tmbId,
          dataId: data.dataId
        });

        try {
          const { tokens } = await rebuildData({ trainingData: data, lease });

          // push usage
          const modelHandle = await getModelHandle();
          pushGenerateVectorUsage({
            teamId: data.teamId,
            tmbId: data.tmbId,
            inputTokens: tokens,
            model: modelHandle.getEmbeddingModelData(
              getDatasetModelReference(data.dataset, 'embedding')
            ),
            usageId: data.billId
          });

          logger.info('Vector queue task finished', {
            durationMs: Date.now() - start,
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            dataId: data.dataId
          });
        } catch (err: any) {
          logger.error('Vector queue task failed', {
            error: err,
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            dataId: data.dataId
          });
          if (!(err instanceof TrainingLeaseLostError)) {
            await lease.fail(err);
          }
          await delay(100);
        }
      } finally {
        await lease.stop();
      }
    }
  } catch (error) {
    logger.error('Vector queue loop failed', { error });
  } finally {
    if (reduceQueue()) {
      logger.info('Vector queue drained', { queueSize: global.vectorQueueLen });
    }
    logger.debug('Vector queue loop exit', { queueSize: global.vectorQueueLen });
  }
}

/**
 * 在处理当前 rebuild 前先补充下一条任务。
 * 重试耗尽后必须向上抛错，让当前 training 保持可重试，避免链路在仍有 rebuilding data 时中断。
 */
const enqueueFollowingDatasetRebuild = async ({
  trainingData
}: {
  trainingData: TrainingDataType;
}) => {
  const modelHandle = await getModelHandle();
  return retryFn(() =>
    enqueueNextDatasetRebuildTask({
      teamId: String(trainingData.teamId),
      tmbId: String(trainingData.tmbId),
      datasetId: String(trainingData.datasetId),
      billId: trainingData.billId,
      vectorModel: modelHandle.getEmbeddingModelData(
        getDatasetModelReference(trainingData.dataset, 'embedding')
      ),
      vlmModel: modelHandle.getVlmModelData(getDatasetModelReference(trainingData.dataset, 'vlm'), {
        optional: true
      }),
      synonymVersion: trainingData.synonymVersion
    })
  );
};

const rebuildData = async ({
  trainingData,
  lease
}: {
  trainingData: TrainingDataType;
  lease: TrainingTaskLease;
}) => {
  // 续接失败时保留当前 training 重试，否则最后一条任务可能结束而仍有 data 待重建。
  await enqueueFollowingDatasetRebuild({ trainingData });

  if (!trainingData.data) {
    await lease.complete();
    if (trainingData.synonymVersion) return { tokens: 0 };
    return Promise.reject('Not data');
  }
  const datasetData = trainingData.data;
  const modelHandle = await getModelHandle();
  const embModel = modelHandle.getEmbeddingModelData(
    getDatasetModelReference(trainingData.dataset, 'embedding')
  );
  const rebuildUpdateInput = await getRebuildUpdateInput(trainingData);

  const { tokens } = await updateDatasetDataByIndexes({
    dataId: String(datasetData._id),
    ...rebuildUpdateInput,
    imageIndex: !!trainingData.collection.imageIndex,
    model: embModel,
    indexSize: trainingData.indexSize || getMaxIndexSize(embModel),
    indexPrefix: trainingData.collection.indexPrefixTitle
      ? `# ${trainingData.collection.name}`
      : undefined,
    forceRebuild: true,
    commit: lease.complete
  });
  return { tokens };
};
