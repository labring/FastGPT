import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { isPermissionSyncDataset } from '@fastgpt/global/core/dataset/apiDataset/utils';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { syncCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { enqueueDatasetPermissionSync } from '@fastgpt/service/core/dataset/datasetPermissionSync';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SyncCollectionBodySchema,
  SyncCollectionResponseSchema,
  type SyncCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';

/*
  Collection sync
  1. Check collection type: link, api dataset collection
  2. Get collection and raw text
  3. Check whether the original text is the same: skip if same
  4. Create new collection
  5. Delete old collection
  6. External permission sync: re-read the file ACLs of this subtree
*/
async function handler(req: ApiRequestProps): Promise<SyncCollectionResponseType> {
  const { collectionId } = parseApiInput({ req, bodySchema: SyncCollectionBodySchema }).body;

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  const result = SyncCollectionResponseSchema.parse(await syncCollection(collection));

  // 内容同步只拉正文，外部文件权限可能同时变了：按该文件当前的记录入队一轮定向权限同步。
  // 正文变化时 syncCollection 会以新 _id 重建 collection，所以必须按 apiFileId 重查，
  // 不能用入参里的旧 id。链接类没有外部权限来源，不入队。
  // 入队是旁路：失败只告警（函数内部吞掉），不影响内容同步结果。
  if (collection.apiFileId && isPermissionSyncDataset(collection.dataset.apiDatasetServer)) {
    const synced = await MongoDatasetCollection.findOne(
      {
        teamId: collection.teamId,
        datasetId: collection.datasetId,
        apiFileId: collection.apiFileId
      },
      '_id'
    ).lean();

    if (synced) {
      await enqueueDatasetPermissionSync({
        datasetId: String(collection.datasetId),
        collectionIds: [String(synced._id)]
      });
    }
  }

  return result;
}

export default NextAPI(handler);
