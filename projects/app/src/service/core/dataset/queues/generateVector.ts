import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';

import { createDatasetData, updateDatasetDataByIndexes } from '@/service/core/dataset/data/data';
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
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { isDatasetDataSystemIndexType } from '@fastgpt/global/core/dataset/data/utils';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
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

/**
 * 获取重建时需要从训练任务透传给 data 层的外部索引。
 *
 * `default` 和 `imageEmbedding` 都是系统索引，由 data/dataIndex 根据当前 q/a/imageId
 * 重新生成；这里仅保留 custom/question/summary/image 等外部索引。其中 image 是 VLM
 * 生成的文本描述索引，只有当前集合仍开启图片索引且 VLM 可用时才保留。
 */
export const getRebuildBaseIndexes = async (trainingData: TrainingDataType) => {
  const sourceIndexes = trainingData.indexes?.length
    ? trainingData.indexes.map((index) => ({ ...index }))
    : trainingData.data?.indexes || [];
  const modelHandle = await getModelHandle();
  const { supportVlm } = getDatasetImageIndexCapability({
    vectorModel: modelHandle.getEmbeddingModelData(
      getDatasetModelReference(trainingData.dataset, 'embedding')
    ),
    vlmModel: modelHandle.getVlmModelData(getDatasetModelReference(trainingData.dataset, 'vlm'), {
      optional: true
    })
  });

  return sourceIndexes.filter((index) => {
    if (isDatasetDataSystemIndexType(index.type)) {
      return false;
    }
    if (
      index.type === DatasetDataIndexTypeEnum.image &&
      (!supportVlm || !trainingData.collection.imageIndex)
    ) {
      return false;
    }
    return true;
  });
};

/**
 * 获取完整 rebuild 最终写入的数据，优先使用本轮图片和自动索引训练产物。
 */
export const getRebuildUpdateInput = async (trainingData: TrainingDataType) => {
  if (!trainingData.data) return;

  return {
    q: trainingData.q ? trainingData.q : trainingData.data.q,
    a: trainingData.a ?? trainingData.data.a,
    imageId: trainingData.data.imageId,
    indexes: await getRebuildBaseIndexes(trainingData),
    imageDescMap: trainingData.imageDescMap
  };
};

/** 消费普通创建和重建任务；每条任务独立管理心跳，队列退出时归还并发名额。 */
export async function generateVector(): Promise<any> {
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
          mode: TrainingModeEnum.chunk,
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
          if (data.synonymVersion && data.dataset && data.dataId) {
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
          const { tokens } = await (async () => {
            if (!data.dataId) return insertData({ trainingData: data, lease });
            return rebuildData({ trainingData: data, lease });
          })();

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
  // 同义词重建需要可靠续接；普通模型重建保持原有的尽力续接语义。
  if (trainingData.synonymVersion) {
    await enqueueFollowingDatasetRebuild({ trainingData });
  } else {
    await enqueueFollowingDatasetRebuild({ trainingData }).catch(() => {});
  }

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
    lease
  });
  return { tokens };
};

const insertData = async ({
  trainingData,
  lease
}: {
  trainingData: TrainingDataType;
  lease: TrainingTaskLease;
}) => {
  // 在业务事务开始前获取目录，避免刷新等待延长持锁时间。
  const modelHandle = await getModelHandle();
  const embModel = modelHandle.getEmbeddingModelData(
    getDatasetModelReference(trainingData.dataset, 'embedding')
  );

  // insert new data to dataset
  const { tokens } = await createDatasetData({
    teamId: trainingData.teamId,
    tmbId: trainingData.tmbId,
    datasetId: trainingData.datasetId,
    collectionId: trainingData.collectionId,
    q: trainingData.q,
    a: trainingData.a,
    imageId: trainingData.imageId,
    imageDescMap: trainingData.imageDescMap,
    ...(trainingData.dataMetadata && { metadata: trainingData.dataMetadata }),
    chunkIndex: trainingData.chunkIndex,
    indexSize: trainingData.indexSize || getMaxIndexSize(embModel),
    indexes: trainingData.indexes || [],
    indexPrefix: trainingData.collection.indexPrefixTitle
      ? `# ${trainingData.collection.name}`
      : undefined,
    embeddingModel: embModel,
    imageIndex: !!trainingData.collection.imageIndex,
    lease
  });
  return {
    tokens
  };
};
