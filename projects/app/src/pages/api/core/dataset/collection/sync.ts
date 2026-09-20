import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { syncCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SyncCollectionBodySchema,
  SyncCollectionResponseSchema,
  type SyncCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

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

  const result = SyncCollectionResponseSchema.parse(await syncCollection(collection));

  // 单集合同步是同步完成的，不需要 taskId 关联异步收口；审计写入不阻塞接口返回
  void addAuditLog({
    teamId,
    tmbId,
    scope: 'member',
    event: AuditEventEnum.SYNC_DATASET,
    params: {
      datasetId: String(collection.datasetId),
      datasetName: collection.dataset.name,
      datasetType: getI18nDatasetType(collection.dataset.type),
      result,
      addedCount: '0',
      updatedCount: result === 'success' ? '1' : '0',
      deletedCount: '0',
      failedCount: result === 'failed' ? '1' : '0',
      details: [
        {
          resourceId: collectionId,
          resourceName: collection.name,
          resourceType: 'collection',
          action: 'sync',
          result
        }
      ]
    }
  }).catch((error) => {
    logger.error('Dataset sync audit write failed', { error, teamId, collectionId });
  });

  return result;
}

export default NextAPI(handler);
