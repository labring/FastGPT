import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { collectionCanSync } from '@fastgpt/global/core/dataset/collection/utils';
import { syncCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SyncCollectionBodySchema,
  SyncCollectionResponseSchema,
  type SyncCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';

/** 记录通过鉴权的集合同步尝试，再执行同步；抓取失败沿用同步服务的原始错误。 */
async function handler(req: ApiRequestProps): Promise<SyncCollectionResponseType> {
  const { collectionId } = parseApiInput({ req, bodySchema: SyncCollectionBodySchema }).body;

  const { collection, teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  // 审计记录发起操作，在抓取前写入，避免超时、404 或空正文抛错时漏记。
  // 不支持同步的类型仍由同步服务报错，不产生同步尝试日志。
  if (collectionCanSync(collection.type)) {
    void addAuditLog({
      tmbId,
      teamId,
      event: DatasetAuditEventEnum.DATASET_COLLECTION_SYNC,
      params: {
        datasetName: collection.dataset?.name ?? '',
        collectionName: collection.name
      }
    });
  }

  return SyncCollectionResponseSchema.parse(await syncCollection(collection));
}

export default NextAPI(handler);
