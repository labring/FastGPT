import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { addCollectionDeleteJob } from '@fastgpt/service/core/dataset/collection/delete';
import { deleteCollectionsImmediate } from '@fastgpt/service/core/dataset/collection/delete/processor';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  DeleteCollectionBodySchema,
  DeleteCollectionQuerySchema
} from '@fastgpt/global/openapi/core/dataset/collection/api';

async function handler(req: ApiRequestProps) {
  const { id } = DeleteCollectionQuerySchema.parse(req.query);
  const { collectionIds, apiFileIds, datasetId } = DeleteCollectionBodySchema.parse(req.body);

  let deletedIds: string[];

  if (id) {
    deletedIds = [id];
  } else if (collectionIds && collectionIds.length > 0) {
    deletedIds = collectionIds;
  } else if (apiFileIds && apiFileIds.length > 0 && datasetId) {
    // 通过 apiFileId 删除：从请求头直接解析 teamId，再配合 datasetId 利用已有索引查询
    const { teamId: authTeamId } = await parseHeaderCert({
      req,
      authToken: true,
      authApiKey: true
    });
    const collectionsByApiFile = await MongoDatasetCollection.find(
      { teamId: authTeamId, datasetId, apiFileId: { $in: apiFileIds }, deleteTime: null },
      '_id'
    ).lean();

    if (collectionsByApiFile.length === 0) {
      return Promise.reject(DatasetErrEnum.unExistCollection);
    }

    deletedIds = collectionsByApiFile.map((c) => String(c._id));
  } else {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  if (!Array.isArray(deletedIds) || deletedIds.length === 0) {
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
