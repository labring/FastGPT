import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteCollectionBodySchema,
  DeleteCollectionQuerySchema
} from '@fastgpt/global/openapi/core/dataset/collection/api';

async function handler(req: ApiRequestProps) {
  const { id } = parseApiInput({ req, querySchema: DeleteCollectionQuerySchema }).query;
  const { collectionIds } = parseApiInput({ req, bodySchema: DeleteCollectionBodySchema }).body;

  const deletedIds = id ? [id] : collectionIds;

  if (!Array.isArray(deletedIds)) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 删除会把 folder 及其子树一并删掉（delCollection 递归），属于结构性管理员操作：
  // 统一要求 collection manage，write 协作者只能改内容、不能删结构。
  const [{ teamId, collection, tmbId }] = await Promise.all(
    deletedIds.map(async (collectionId) => {
      return await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId,
        per: ManagePermissionVal
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

  // delete
  await mongoSessionRun((session) =>
    delCollection({
      collections,
      delImg: true,
      delFile: true,
      session
    })
  );

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
