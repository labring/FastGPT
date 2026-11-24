import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  cleanDatasetLegacySystemRootInSession,
  type CleanDatasetLegacySystemRootResult
} from '@fastgpt/service/core/dataset/apiDataset/service';

export type CleanSingleDatasetSystemRootResult = CleanDatasetLegacySystemRootResult;

/**
 * 在单库事务内清理一个知识库的 SYSTEM_ROOT 哨兵集合并回填 Dataset.syncAll = true。
 * 复用 apiDataset/service 中的统一清理逻辑，保证手动迁移与运行时状态切换口径一致。
 */
export const cleanSingleDatasetSystemRoot = async ({
  datasetId
}: {
  datasetId: string;
}): Promise<CleanSingleDatasetSystemRootResult> =>
  mongoSessionRun((session) =>
    cleanDatasetLegacySystemRootInSession({
      datasetId,
      session,
      backfillSyncAll: true
    })
  );
