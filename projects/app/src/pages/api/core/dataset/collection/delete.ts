import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { addCollectionDeleteJob } from '@fastgpt/service/core/dataset/collection/delete';
import { deleteCollectionsImmediate } from '@fastgpt/service/core/dataset/collection/delete/processor';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

export type DelCollectionBody = {
  collectionIds: string[];
};

async function handler(req: ApiRequestProps<DelCollectionBody, { id?: string }>) {
  const id = req.query.id;
  const { collectionIds } = req.body;

  const deletedIds = id ? [id] : collectionIds;

  if (!Array.isArray(deletedIds)) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const [{ teamId, collection, tmbId }] = await Promise.all(
    deletedIds.map(async (collectionId) => {
      return await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId,
        per: WritePermissionVal
      });
    })
  );

  // find all delete id
  const collections = await Promise.all(
    deletedIds.map(async (collectionId) => {
      return await findCollectionAndChild({
        teamId,
        datasetId: collection.datasetId,
        collectionId,
        fields: '_id teamId type datasetId fileId metadata'
      });
    })
  ).then((res) => {
    const flattened = res.flat();
    // Remove duplicates based on _id
    const uniqueCollections = flattened.filter(
      (collection, index, arr) =>
        arr.findIndex((item) => item._id.toString() === collection._id.toString()) === index
    );
    return uniqueCollections;
  });

  const allCollectionIds = collections.map((c) => String(c._id));
  const datasetIds = Array.from(new Set(collections.map((c) => String(c.datasetId))));

  // 1. 标记 deleteTime（软删除），立即从列表中隐藏
  await MongoDatasetCollection.updateMany(
    {
      _id: { $in: allCollectionIds },
      teamId
    },
    {
      $set: { deleteTime: new Date() }
    }
  );

  // 2. 快速清理训练数据（避免继续消耗资源）
  await deleteCollectionsImmediate({
    teamId,
    datasetIds,
    collectionIds: allCollectionIds
  });

  // 3. 添加到 BullMQ 删除队列，后台异步执行实际删除
  await addCollectionDeleteJob({
    teamId,
    collectionIds: allCollectionIds
  });

  // 4. 审计日志（异步，不阻塞响应）
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_COLLECTION,
      params: {
        collectionName: collection.name,
        datasetName: collection.dataset?.name || '',
        datasetType: getI18nDatasetType(collection.dataset?.type || '')
      }
    });
  })();
}

export default NextAPI(handler);
