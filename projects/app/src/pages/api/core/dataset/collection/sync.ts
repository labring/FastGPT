import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { syncCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SyncCollectionBodySchema,
  SyncCollectionResponseSchema,
  type SyncCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import type { TeamAuditDetail } from '@fastgpt/global/support/user/audit/type';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { startDatasetTaskAudit } from '@fastgpt/service/core/dataset/audit';

/*
  Collection sync
  1. Check collection type: link, api dataset collection
  2. Get collection and raw text
  3. Check whether the original text is the same: skip if same
  4. Create new collection
  5. Delete old collection
*/
async function handler(req: ApiRequestProps): Promise<SyncCollectionResponseType> {
  const { collectionId } = parseApiInput({ req, bodySchema: SyncCollectionBodySchema }).body;

  const { collection, teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  // 必须在调用 syncCollection 前创建并透传 taskId；训练任务和接口共享同一个审计主记录。
  const auditTask = await startDatasetTaskAudit({
    teamId,
    tmbId,
    event: AuditEventEnum.SYNC_DATASET,
    params: {
      datasetId: String(collection.datasetId),
      datasetName: collection.dataset.name,
      datasetType: getI18nDatasetType(collection.dataset.type),
      addedCount: '0',
      updatedCount: '0',
      deletedCount: '0',
      failedCount: '0',
      details: [
        {
          resourceId: collectionId,
          resourceName: collection.name,
          resourceType: 'collection',
          action: 'sync',
          result: 'processing'
        }
      ]
    }
  });
  const auditTaskId = auditTask.taskId;

  /** 将源同步结果转换成审计明细；success 仍保持 processing，等待异步训练收口。 */
  const buildAuditDetail = ({
    result,
    resourceId
  }: {
    result: SyncCollectionResponseType;
    resourceId: string;
  }): TeamAuditDetail => ({
    resourceId,
    resourceName: collection.name,
    resourceType: 'collection',
    action: 'sync',
    result: (() => {
      if (result === 'success') return 'processing';
      if (result === 'sameRaw') return 'unchanged';
      return 'failed';
    })()
  });

  /** 写入单集合同步主事件，并让训练队列在无任务或任务完成后立即尝试收口。 */
  const writeAuditLog = async ({
    result,
    resourceId = collectionId
  }: {
    result: SyncCollectionResponseType;
    resourceId?: string;
  }) => {
    const isSuccess = result === 'success';
    const isFailed = result === 'failed';

    await auditTask.finish({
      result: isSuccess ? 'processing' : isFailed ? 'failed' : 'success',
      metadata: {
        updatedCount: isSuccess ? '1' : '0',
        failedCount: isFailed ? '1' : '0',
        sourceFailedCount: isFailed ? '1' : '0',
        details: [buildAuditDetail({ result, resourceId })]
      }
    });
    await auditTask.refresh();
  };

  try {
    const syncResult = await syncCollection(collection, auditTaskId);
    const result = SyncCollectionResponseSchema.parse(syncResult.result);
    await writeAuditLog({ result, resourceId: syncResult.collectionId });
    return result;
  } catch (error) {
    // 源读取或重建事务失败时也留下失败审计，避免接口失败后完全没有操作记录。
    await writeAuditLog({ result: DatasetCollectionSyncResultEnum.failed });
    throw error;
  }
}

export default NextAPI(handler);
