import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
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
  const { collectionIds, apiFileIds, datasetId } = parseApiInput({
    req,
    bodySchema: DeleteCollectionBodySchema
  }).body;

  let deletedIds: string[];

  if (id) {
    deletedIds = [id];
  } else if (collectionIds?.length) {
    deletedIds = collectionIds;
  } else if (apiFileIds?.length && datasetId) {
    // 外部集成只知道 API 文件身份：用请求头 teamId + datasetId 定位内部 _id，后续复用原有删除流程
    if (apiFileIds.includes(RootCollectionId)) {
      return Promise.reject(CommonErrEnum.invalidParams);
    }
    const { teamId } = await parseHeaderCert({ req, authToken: true, authApiKey: true });
    const matched = await MongoDatasetCollection.find(
      { teamId, datasetId, apiFileId: { $in: apiFileIds } },
      '_id'
    ).lean();

    if (matched.length === 0) {
      return Promise.reject(DatasetErrEnum.unExistCollection);
    }
    deletedIds = matched.map((item) => String(item._id));
  } else {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 删除是 owner 专属操作：仅集合所有者（collection.tmbId）可删，持有 manage/write 的协作者不可删。
  // 与 dataset / app / skill 删除保持一致（不可逆操作由 owner 唯一决策）。
  const [{ teamId, collection, tmbId }] = await Promise.all(
    deletedIds.map(async (collectionId) => {
      return await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId,
        per: OwnerPermissionVal
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
