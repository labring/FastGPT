import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { LEGACY_SYSTEM_ROOT_API_FILE_ID } from '@fastgpt/service/core/dataset/apiDataset/utils';
import type { SystemMigrationContext } from '@/migration/registry';
import { cleanSingleDatasetSystemRoot } from './service';

const SYSTEM_ROOT_QUERY = {
  $or: [
    { apiFileId: LEGACY_SYSTEM_ROOT_API_FILE_ID },
    { apiFileParentId: LEGACY_SYSTEM_ROOT_API_FILE_ID }
  ]
};

/**
 * 清理存量 API 知识库的 SYSTEM_ROOT 哨兵集合并回填 Dataset.syncAll = true。
 * 采用幂等全量扫描 + 逐库事务 + 全集合二次核验，不依赖 checkpoint，失败后重跑安全无副作用。
 */
export const cleanApiDatasetSystemRoot = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'migrate', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  const docs = await MongoDatasetCollection.find(SYSTEM_ROOT_QUERY, '_id datasetId')
    .sort({ _id: 1 })
    .lean();

  const datasetIds = Array.from(new Set(docs.map((doc) => String(doc.datasetId)))).sort();
  let processedDatasets = 0;
  let totalSentinels = 0;
  let totalReparented = 0;

  for (const datasetId of datasetIds) {
    context.signal.throwIfAborted();
    await context.assertActive();

    const { sentinels, reparented } = await cleanSingleDatasetSystemRoot({ datasetId });
    processedDatasets += 1;
    totalSentinels += sentinels;
    totalReparented += reparented;

    await context.reportProgress({
      key: 'migrate',
      status: SystemMigrationStatusEnum.running,
      current: processedDatasets,
      total: datasetIds.length
    });
  }

  await context.reportProgress({
    key: 'migrate',
    status: SystemMigrationStatusEnum.succeeded,
    current: processedDatasets,
    total: datasetIds.length
  });

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  // 全集合二次核验，确认无任何残留 SYSTEM_ROOT 哨兵或父级引用
  const remaining = await MongoDatasetCollection.find(SYSTEM_ROOT_QUERY, '_id datasetId')
    .sort({ _id: 1 })
    .limit(50)
    .lean();

  if (remaining.length > 0) {
    const failedRecords: SystemMigrationFailedRecord[] = remaining.map((doc) => ({
      stageKey: 'validation',
      data: {
        id: String(doc._id),
        datasetId: String(doc.datasetId)
      },
      reason: {
        message: 'Remaining legacy SYSTEM_ROOT collection or parent reference found after migration'
      }
    }));
    await context.fail({
      message: 'Legacy SYSTEM_ROOT references still remain after cleanup',
      failedRecords
    });
  }

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });

  return {
    datasets: processedDatasets,
    sentinels: totalSentinels,
    reparented: totalReparented
  };
};
