import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { isPermissionSyncDataset } from '@fastgpt/global/core/dataset/apiDataset/utils';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { collectionCanSync } from '@fastgpt/global/core/dataset/collection/utils';
import { syncCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { enqueueDatasetPermissionSync } from '@fastgpt/service/core/dataset/datasetPermissionSync';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SyncCollectionBodySchema,
  SyncCollectionResponseSchema,
  type SyncCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { buildCollectionAuditResource } from '@fastgpt/global/support/user/audit/type';

/**
 * 记录通过鉴权的集合同步尝试，再执行同步；抓取失败沿用同步服务的原始错误。
 * 日志归属集合团队并保留实际操作者，兼容系统 root 跨团队操作。
 * 对开启外部权限同步的 API 文件库集合，同步完成后旁路入队一轮定向权限同步。
 */
async function handler(req: ApiRequestProps): Promise<SyncCollectionResponseType> {
  const { collectionId } = parseApiInput({ req, bodySchema: SyncCollectionBodySchema }).body;

  const { collection, tmbId } = await authDatasetCollection({
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
      teamId: String(collection.teamId),
      event: DatasetAuditEventEnum.DATASET_COLLECTION_SYNC,
      resources: [buildCollectionAuditResource(collection)],
      params: {}
    });
  }

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
