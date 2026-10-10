import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import {
  claimTrainingTask,
  TrainingLeaseLostError,
  type TrainingTaskLease
} from '@fastgpt/service/core/dataset/training/service';
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
import { delay } from '@fastgpt/global/common/system/utils';
import type { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { isDatasetDataIndexed } from '@fastgpt/global/core/dataset/data/utils';
import { updateDatasetDataByIndexes } from '@/service/core/dataset/data/data';
import { getIndexTrainingUpdateInput } from './indexInput';
import { refreshTrainingAuditTask } from '@fastgpt/service/core/dataset/training/audit';

const logger = getLogger(LogCategories.MODULE.DATASET.EMBEDDING);

const reduceQueue = () => {
  global.preCreatedQueueLen = global.preCreatedQueueLen > 0 ? global.preCreatedQueueLen - 1 : 0;

  return global.preCreatedQueueLen === 0;
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
    indexStatus?: DatasetDataIndexStatusEnum;
  };
};
type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

/**
 * 专门处理预先创建的数据：向量、全文索引和 indexed 状态在同一事务内写回原数据。
 * 该队列与普通 vector/rebuild 队列隔离，避免一个 worker 根据 dataId 和状态猜测任务类型。
 */
export async function generatePreCreatedData(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
  logger.debug('Pre-created data queue size check', {
    queueSize: global.preCreatedQueueLen,
    max
  });

  // 首次索引使用自己的并发预算；两类重建分别以并发 1 独立运行。
  if (global.preCreatedQueueLen >= max) return;
  global.preCreatedQueueLen++;

  try {
    while (true) {
      const start = Date.now();
      let claimed;
      try {
        claimed = await claimTrainingTask<PopulateType>({
          mode: TrainingModeEnum.index,
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
              select: '_id q a imageId indexes indexStatus'
            }
          ]
        });
      } catch (error) {
        logger.error('Pre-created data queue fetch task failed', { error });
        await delay(500);
        continue;
      }

      if (!claimed) break;
      const { data, lease } = claimed;
      try {
        lease.start();
        if (!data.dataset || !data.collection || !data.data) {
          logger.info('Pre-created data task skipped: related data missing', {
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            dataId: data.dataId
          });
          await lease.complete();
          await refreshTrainingAuditTask(data.auditTaskId);
          continue;
        }

        // 任务可能在 worker 崩溃后重试，此时数据已 indexed，直接清理残留任务即可。
        if (isDatasetDataIndexed(data.data.indexStatus)) {
          await lease.complete();
          await refreshTrainingAuditTask(data.auditTaskId);
          continue;
        }

        if (!(await checkTeamAiPointsAndLock(data.teamId, String(data._id)))) {
          continue;
        }

        logger.info('Pre-created data task started', {
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          teamId: data.teamId,
          tmbId: data.tmbId,
          dataId: data.dataId
        });

        try {
          const { tokens } = await updatePreCreatedData({ trainingData: data, lease });
          await refreshTrainingAuditTask(data.auditTaskId);

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

          logger.info('Pre-created data task finished', {
            durationMs: Date.now() - start,
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            dataId: data.dataId
          });
        } catch (err: any) {
          logger.error('Pre-created data task failed', {
            error: err,
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            dataId: data.dataId
          });
          if (!(err instanceof TrainingLeaseLostError)) {
            await lease.fail(err);
            await refreshTrainingAuditTask(data.auditTaskId);
          }
          await delay(100);
        }
      } finally {
        await lease.stop();
      }
    }
  } catch (error) {
    logger.error('Pre-created data queue loop failed', { error });
  } finally {
    if (reduceQueue()) {
      logger.info('Pre-created data queue drained', { queueSize: global.preCreatedQueueLen });
    }
    logger.debug('Pre-created data queue loop exit', { queueSize: global.preCreatedQueueLen });
  }
}

const updatePreCreatedData = async ({
  trainingData,
  lease
}: {
  trainingData: TrainingDataType;
  lease: TrainingTaskLease;
}) => {
  const datasetData = trainingData.data!;
  const modelHandle = await getModelHandle();
  const embModel = modelHandle.getEmbeddingModelData(
    getDatasetModelReference(trainingData.dataset, 'embedding')
  );
  const indexTrainingInput = await getIndexTrainingUpdateInput(trainingData);

  const { tokens } = await updateDatasetDataByIndexes({
    dataId: String(datasetData._id),
    ...indexTrainingInput,
    imageIndex: !!trainingData.collection.imageIndex,
    model: embModel,
    indexSize: trainingData.indexSize || getMaxIndexSize(embModel),
    indexPrefix: trainingData.collection.indexPrefixTitle
      ? `# ${trainingData.collection.name}`
      : undefined,
    commit: lease.complete
  });
  return { tokens };
};
