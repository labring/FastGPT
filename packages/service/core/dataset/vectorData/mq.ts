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
import { getVectorCount } from '../../../common/vectorDB/controller';
import { withTimeout } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.INFRA.QUEUE);

/** 创建与清理分别去重，共享维护队列和全局槽位；失败移除任务，等待下次统计重新投递。 */
const getDatasetVectorIndexQueue = () =>
  bullMQ.getQueue<PgDatasetIndexScope>(QueueNames.datasetVectorIndex, {
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true
    }
  });

/**
 * 真实计数超过三万时创建、低于两万时清理可能存在的索引；中间区间和普通小库不额外投递。
 * 创建与清理分别使用 datasetId-build / datasetId-cleanup，避免建图期间的清理通知被活跃任务吞掉。
 */
export const onDatasetVectorCounted = async ({
  rows,
  ...scope
}: PgDatasetIndexScope & { rows: number }) => {
  if (getVectorType() !== 'pg') return;
  const shouldBuild = rows > DATASET_VECTOR_INDEX_MIN_ROWS;
  if (!shouldBuild && rows >= DATASET_VECTOR_INDEX_DROP_ROWS) return;
  const dataset = await findDatasetVectorData(scope);
  if (!dataset) return;
  const data = dataset.vectorData;
  // 缺少索引元数据或已确认 none 的小库无需检查目录，避免所有小库都进入维护队列。
  if (!shouldBuild && (!data || data.pgIndex === 'none')) return;

  // 先可靠投递再置 pending；进程中断重投安全，状态更新也不能覆盖正在构建/已完成状态。
  const operation = shouldBuild ? 'build' : 'cleanup';
  await getDatasetVectorIndexQueue().add(operation, scope, {
    jobId: `${scope.datasetId}-${operation}`
  });
  if (shouldBuild && (!data || data.pgIndex === 'none' || data.pgIndex === 'failed')) {
    // 消费可能先完成，只有读取时的状态快照未变化，才能补写 pending。
    await updateDatasetPgIndexState({
      ...scope,
      pgIndex: 'pending',
      expectedCheckedAt: data?.pgIndexCheckedAt
    });
  }
};

/**
 * 通过 PG 目录核验后同步状态；创建完成后重新统计并可靠补投清理，覆盖构建中行数下降的边界。
 * 清理任务回涨后保留有效索引；两种任务均只尝试一次，失败等待下次统计重新投递。
 */
export const processDatasetVectorIndex = async (
  scope: PgDatasetIndexScope,
  { operation }: { operation: 'build' | 'cleanup' }
) => {
  const dataset = await findDatasetVectorData(scope);
  if (!dataset) return;
  const startedAt = Date.now();
  try {
    const result = await ensurePgDatasetIndex({
      ...scope,
      allowCreate: operation === 'build',
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
    if (operation === 'build' && result.created) {
      // 不依赖构建期间是否发生过统计通知；刷新 Redis 行数后，用另一个 jobId 保留后续清理意图。
      const rows = await getVectorCount(scope, { refresh: true, notifyDatasetCounted: false });
      if (rows < DATASET_VECTOR_INDEX_DROP_ROWS) {
        await withTimeout(onDatasetVectorCounted({ ...scope, rows }), 60000);
      }
    }
    logger.info('PG dataset FP16 index task completed', {
      ...scope,
      operation,
      ...result,
      elapsedMs: Date.now() - startedAt
    });
  } catch (error) {
    // 资源不足也按普通失败处理，暂不通过降低并行度或内存预算保证建图成功。
    // 下次真实统计仍按原预算规则投递，资源限制未解除时可能再次失败；failed 期间走精确检索。
    // Mongo 故障不掩盖原始构建错误；下次真实统计重新投递后再核验，成功索引无需重复构建。
    await updateDatasetPgIndexState({ ...scope, pgIndex: 'failed' }).catch((stateError) =>
      logger.warn('Failed to update dataset PG index state', { ...scope, error: stateError })
    );
    logger.error('PG dataset FP16 index task failed', { ...scope, operation, error });
    throw error;
  }
};

/** 所有应用节点共享一个维护槽位；CREATE / DROP 串行执行，先设置全局并发再启动消费。 */
export const initDatasetVectorIndexWorker = async () => {
  if (getVectorType() !== 'pg') return;
  await getDatasetVectorIndexQueue().setGlobalConcurrency(1);
  return bullMQ.getWorker<PgDatasetIndexScope>(
    QueueNames.datasetVectorIndex,
    (job) => {
      if (job.name !== 'build' && job.name !== 'cleanup') {
        throw new Error(`Unknown PG dataset index task: ${job.name}`);
      }
      return processDatasetVectorIndex(job.data, { operation: job.name });
    },
    { concurrency: 1 }
  );
};
