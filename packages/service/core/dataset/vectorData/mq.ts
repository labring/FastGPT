import { bullMQ } from '@fastgpt/dal/redis/bullmq/binding';
import { QueueNames } from '@fastgpt/dal/redis/bullmq/names';
import {
  DATASET_VECTOR_INDEX_MIN_ROWS,
  DATASET_VECTOR_INDEX_DROP_ROWS
} from '@fastgpt/global/core/dataset/vectorData/constants';
import { getVectorType } from '../../../common/vectorDB/constants';
import {
  ensurePgDatasetIndex,
  type PgDatasetIndexScope
} from '../../../common/vectorDB/pg/datasetIndex';
import { getLogger, LogCategories } from '../../../common/logger';
import { findDatasetVectorData, updateDatasetPgIndexState } from './entity';

const logger = getLogger(LogCategories.INFRA.QUEUE);
const INDEX_MAINTENANCE_DELAY_MS = 10 * 60 * 1000;

/** 固定 jobId 在 delayed/waiting/active 期间去重；失败移除任务，等待下次真实统计重新投递。 */
const getDatasetVectorIndexQueue = () =>
  bullMQ.getQueue<PgDatasetIndexScope>(QueueNames.datasetVectorIndex, {
    defaultJobOptions: {
      delay: INDEX_MAINTENANCE_DELAY_MS,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true
    }
  });

/**
 * 真实计数超过三万时创建、低于两万时清理可能存在的索引；中间区间和普通小库不额外投递。
 * CREATE / DROP 共用固定 jobId；日常统计保留首次延迟窗口，迁移可立即激活已投递的延迟任务。
 */
export const onDatasetVectorCounted = async (
  { rows, ...scope }: PgDatasetIndexScope & { rows: number },
  { immediate = false }: { immediate?: boolean } = {}
) => {
  if (getVectorType() !== 'pg') return;
  const shouldBuild = rows > DATASET_VECTOR_INDEX_MIN_ROWS;
  if (!shouldBuild && rows >= DATASET_VECTOR_INDEX_DROP_ROWS) return;
  const dataset = await findDatasetVectorData(scope);
  if (!dataset) return;
  const data = dataset.vectorData;
  // 缺少索引元数据或已确认 none 的小库无需检查目录，避免所有小库都进入维护队列。
  if (!shouldBuild && (!data || data.pgIndex === 'none')) return;

  // 先可靠投递再置 pending；进程中断重投安全，状态更新也不能覆盖正在构建/已完成状态。
  const job = await getDatasetVectorIndexQueue().add('maintain', scope, {
    jobId: String(scope.datasetId)
  });
  if (shouldBuild && (!data || data.pgIndex === 'none' || data.pgIndex === 'failed')) {
    await updateDatasetPgIndexState({ ...scope, pgIndex: 'pending' });
  }

  // 先同步 pending 再解除延迟，避免立即消费后把快速失败的 failed 状态覆盖回 pending。
  // add 的同名去重不会修改旧延迟；同时提升已有任务，已排队/执行的任务继续复用。
  if (immediate && (await job.getState()) === 'delayed') {
    await job.promote().catch(async (error) => {
      // 其他迁移节点或 worker 可能已推进任务；仍在 delayed 才视为本次投递未完成。
      if ((await job.getState()) === 'delayed') throw error;
    });
  }
};

/** 通过 PG 目录核验后同步最终状态；失败保留 failed 状态，由下次真实统计重新投递。 */
export const processDatasetVectorIndex = async (scope: PgDatasetIndexScope) => {
  const dataset = await findDatasetVectorData(scope);
  if (!dataset) return;
  const startedAt = Date.now();
  try {
    const result = await ensurePgDatasetIndex({
      ...scope,
      onBuilding: async () => {
        const result = await updateDatasetPgIndexState({ ...scope, pgIndex: 'building' });
        // deleteTime 条件与状态更新原子判断，挡住进入删除流程前已领取的陈旧任务。
        return result.matchedCount > 0;
      },
      onRemoving: async () => {
        await updateDatasetPgIndexState({ ...scope, pgIndex: 'removing' });
      },
      onProgress: (progress) => {
        // blocks 是当前阶段的进度，等待旧事务等阶段没有总量，不能伪装为整个任务百分比。
        logger.info('PG dataset FP16 index build progress', {
          ...scope,
          ...progress,
          phasePercent:
            progress.blocksTotal > 0
              ? Math.round((1000 * progress.blocksDone) / progress.blocksTotal) / 10
              : undefined,
          elapsedMs: Date.now() - startedAt
        });
      }
    });
    await updateDatasetPgIndexState({ ...scope, pgIndex: result.pgIndex });
    logger.info('PG dataset FP16 index task completed', {
      ...scope,
      ...result,
      elapsedMs: Date.now() - startedAt
    });
  } catch (error) {
    // Mongo 故障不掩盖原始构建错误；下次真实统计重新投递后再核验，成功索引无需重复构建。
    await updateDatasetPgIndexState({ ...scope, pgIndex: 'failed' }).catch((stateError) =>
      logger.warn('Failed to update dataset PG index state', { ...scope, error: stateError })
    );
    logger.error('PG dataset FP16 index task failed', { ...scope, error });
    throw error;
  }
};

/** 所有应用节点共享一个维护槽位；CREATE / DROP 串行执行，先设置全局并发再启动消费。 */
export const initDatasetVectorIndexWorker = async () => {
  if (getVectorType() !== 'pg') return;
  await getDatasetVectorIndexQueue().setGlobalConcurrency(1);
  return bullMQ.getWorker<PgDatasetIndexScope>(
    QueueNames.datasetVectorIndex,
    (job) => processDatasetVectorIndex(job.data),
    { concurrency: 1 }
  );
};
