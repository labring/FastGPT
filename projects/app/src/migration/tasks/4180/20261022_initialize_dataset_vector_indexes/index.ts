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
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { removeLegacyPgVectorIndex } from './service';

const CursorSchema = ObjectIdSchema.nullable();
const CheckpointSchema = z
  .object({
    endId: CursorSchema,
    lastId: CursorSchema,
    scannedCount: IntSchema,
    eligibleCount: IntSchema,
    total: IntSchema.optional()
  })
  .refine(({ endId, lastId }) => !lastId || (!!endId && lastId <= endId));

/**
 * 固定 _id 上界分批断点续扫：真实统计并可靠投递后才推进 checkpoint，重复批次由 datasetId 去重。
 * 先核验并在线删除旧全局 HNSW，成功后才开始统计和投递，避免本次迁移的建图与旧索引清理交错。
 * 清理失败不扫描、不投递；扫描重试先幂等确认旧索引已删除，再沿用断点继续。
 * 迁移投递后立即进入全局串行建图队列；任务成功不表示局部索引已就绪，不阻塞系统启动。
 * 总量仅初始化一次；兼容旧断点，以已处理数加剩余数补齐，扫描结束后校准并发删除造成的偏差。
 */
export const initializeDatasetVectorIndexes = async (context: SystemMigrationContext) => {
  const isPg = getVectorType() === 'pg';

  // 先完成旧索引清理；扫描和投递尚未开始，失败不会留下本次迁移新创建的建图任务。
  await context.reportProgress({ key: 'legacyIndex', status: SystemMigrationStatusEnum.running });
  if (isPg) {
    await context.assertActive();
    await removeLegacyPgVectorIndex(context);
    await context.assertActive();
  }
  await context.reportProgress({ key: 'legacyIndex', status: SystemMigrationStatusEnum.succeeded });

  await context.reportProgress({ key: 'datasets', status: SystemMigrationStatusEnum.running });
  if (!isPg) {
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
  }

  if (checkpoint.total === undefined) {
    await context.assertActive();
    // 仅统计尚未提交的游标范围，已处理记录即使被删除也不能从累计进度中扣除。
    const remaining = checkpoint.endId
      ? await MongoDataset.countDocuments({
          ...filter,
          _id: {
            $lte: checkpoint.endId,
            ...(checkpoint.lastId ? { $gt: checkpoint.lastId } : {})
          }
        })
      : 0;
    checkpoint.total = checkpoint.scannedCount + remaining;
    await context.saveCheckpoint(checkpoint);
  }

  await context.reportProgress({
    key: 'datasets',
    status: SystemMigrationStatusEnum.running,
    current: checkpoint.scannedCount,
    total: checkpoint.total
  });

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
      // 历史记录先校验归属，避免缺失 teamId 时执行没有租户范围的统计。
      const scope = { teamId: String(dataset.teamId), datasetId: String(dataset._id) };
      if (!ObjectIdSchema.safeParse(dataset.teamId).success) {
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
      eligibleCount: checkpoint.eligibleCount + eligible,
      // 并发恢复软删除记录可能增加扫描数量，保证 current 始终不超过 total。
      total: Math.max(checkpoint.total ?? 0, checkpoint.scannedCount + datasets.length)
    };
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'datasets',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scannedCount,
      total: checkpoint.total
    });
  }

  await context.assertActive();
  // 游标耗尽才校准总量，避免扫描期间删除知识库导致成功阶段停留在不足 100%。
  if (checkpoint.total !== checkpoint.scannedCount) {
    checkpoint.total = checkpoint.scannedCount;
    await context.saveCheckpoint(checkpoint);
  }
  await context.reportProgress({
    key: 'datasets',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.scannedCount,
    total: checkpoint.total
  });

  const result = { scannedCount: checkpoint.scannedCount, eligibleCount: checkpoint.eligibleCount };
  context.logger.info('Historical dataset vector counts and index scheduling completed', result);
  return result;
};
