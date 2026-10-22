import z from 'zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { DATASET_VECTOR_INDEX_MIN_ROWS } from '@fastgpt/global/core/dataset/vectorData/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getVectorCount } from '@fastgpt/service/common/vectorDB/controller';
import { getVectorType } from '@fastgpt/service/common/vectorDB/constants';
import { onDatasetVectorCounted } from '@fastgpt/service/core/dataset/vectorData/mq';
import { withTimeout } from '@fastgpt/global/common/system/utils';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';

const CursorSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/)
  .nullable();
const CheckpointSchema = z
  .object({
    endId: CursorSchema,
    lastId: CursorSchema,
    scannedCount: z.number().int().nonnegative(),
    eligibleCount: z.number().int().nonnegative()
  })
  .refine(({ endId, lastId }) => !lastId || (!!endId && lastId <= endId));

/**
 * 固定 _id 上界分批断点续扫：真实统计并可靠投递后才推进 checkpoint，重复批次由 datasetId 去重。
 * 任务成功只表示完成历史知识库统计与投递，实际建图仍延迟十分钟、全局串行，不阻塞系统启动。
 * 不修改原始向量，不删除旧全局索引；滚动升级的旧节点仍能继续读写。
 */
export const initializeDatasetVectorIndexes = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'datasets', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  if (getVectorType() !== 'pg') {
    await context.reportProgress({ key: 'datasets', status: SystemMigrationStatusEnum.succeeded });
    return { scannedCount: 0, eligibleCount: 0 };
  }

  const filter = { deleteTime: null, type: { $ne: DatasetTypeEnum.folder } };
  let checkpoint: z.infer<typeof CheckpointSchema> | undefined =
    await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint) {
    const end = await MongoDataset.findOne(filter, { _id: 1 }).sort({ _id: -1 }).lean();
    checkpoint = {
      endId: end ? String(end._id) : null,
      lastId: null,
      scannedCount: 0,
      eligibleCount: 0
    };
    await context.saveCheckpoint(checkpoint);
  }

  while (checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const datasets: Pick<DatasetSchemaType, '_id' | 'teamId'>[] = await MongoDataset.find(
      {
        ...filter,
        _id: { $lte: checkpoint.endId, ...(checkpoint.lastId ? { $gt: checkpoint.lastId } : {}) }
      },
      { _id: 1, teamId: 1 }
    )
      .sort({ _id: 1 })
      .limit(systemMigrationBatchSize)
      .lean();
    // 读取空批次同时校验断点上界内已经没有尚未处理的有效知识库。
    if (datasets.length === 0) break;

    let eligible = 0;
    for (const dataset of datasets) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const scope = { teamId: String(dataset.teamId), datasetId: String(dataset._id) };
      if (!/^[a-f0-9]{24}$/.test(scope.teamId)) {
        throw new Error(`Dataset has an invalid team ID: ${scope.datasetId}`);
      }
      const rows = await getVectorCount(scope, { refresh: true, notifyDatasetCounted: false });
      // 升级任务必须确认投递成功，不能依赖正常请求路径的 best-effort 异步通知。
      await context.assertActive();
      await withTimeout(onDatasetVectorCounted({ ...scope, rows }), 60000);
      if (rows > DATASET_VECTOR_INDEX_MIN_ROWS) eligible++;
    }

    await context.assertActive();
    checkpoint = {
      ...checkpoint,
      lastId: String(datasets.at(-1)!._id),
      scannedCount: checkpoint.scannedCount + datasets.length,
      eligibleCount: checkpoint.eligibleCount + eligible
    };
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'datasets',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scannedCount
    });
  }

  await context.assertActive();
  await context.reportProgress({ key: 'datasets', status: SystemMigrationStatusEnum.succeeded });
  const result = { scannedCount: checkpoint.scannedCount, eligibleCount: checkpoint.eligibleCount };
  context.logger.info('Historical dataset vector counts and index scheduling completed', result);
  return result;
};
