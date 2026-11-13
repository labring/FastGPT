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

/** 校验原始 query/body 后解析删除目标，保留旧版 query.id 优先级及集合 owner 校验。 */
async function handler(req: ApiRequestProps) {
  const { query, body } = parseApiInput({
    req,
    querySchema: DeleteCollectionQuerySchema,
    bodySchema: DeleteCollectionBodySchema
  });

  const deletedIds = await (async (): Promise<string[]> => {
    // 旧版 query.id 优先，但原始 body 仍须合法，不能通过兼容分支跳过校验。
    if (query.id) return [query.id];
    if (!body) return Promise.reject(CommonErrEnum.missingParams);
    if ('id' in body) return [body.id];
    if ('collectionIds' in body) return body.collectionIds;
    // 空 body 只用于兼容 query.id，不能让无定位请求进入鉴权和删除流程。
    if (!('apiFileIds' in body)) return Promise.reject(CommonErrEnum.missingParams);

    const { datasetId, apiFileIds } = body;
    // 外部集成只知道 API 文件身份：用请求头 teamId + datasetId 定位内部 _id，后续复用原有删除流程
    if (apiFileIds.includes(RootCollectionId)) {
      return Promise.reject(CommonErrEnum.invalidParams);
    }
    const { teamId } = await parseHeaderCert({ req, authToken: true, authApiKey: true });
    // apiFileId 可以标识远端文件或目录。带子文档的文件会生成「派生目录 + 正文」，
    // 派生目录用 metadata.apiFileSourceId 关联远端 ID，必须一起命中才能删除完整子树。
    const matched = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId,
        $or: [
          { apiFileId: { $in: apiFileIds } },
          { 'metadata.apiFileSourceId': { $in: apiFileIds } }
        ]
      },
      '_id parentId'
    ).lean();

    if (matched.length === 0) {
      return Promise.reject(DatasetErrEnum.unExistCollection);
    }
    const matchedIds = new Set(matched.map((item) => String(item._id)));
    if (matchedIds.size === 1) return [...matchedIds];

    // 按本地 parentId 判断子树覆盖关系，不能使用移动后仍可能保留的远端 apiFileParentId。
    // 每层批量补齐未命中的祖先，避免多个删除目标逐节点串行查库；已读和缺失父级均缓存。
    const parentById = new Map<string, string | null>(
      matched.map((item) => [String(item._id), item.parentId ? String(item.parentId) : null])
    );
    let pendingIds = new Set(
      [...parentById.values()].filter((id): id is string => id !== null && !parentById.has(id))
    );
    while (pendingIds.size > 0) {
      const ancestors = await MongoDatasetCollection.find(
        { _id: { $in: [...pendingIds] }, teamId, datasetId },
        '_id parentId'
      ).lean();
      // 不存在或不属于当前知识库的父级视为断链，不能沿它继续查找其他团队或知识库。
      for (const id of pendingIds) parentById.set(id, null);
      for (const ancestor of ancestors) {
        parentById.set(String(ancestor._id), ancestor.parentId ? String(ancestor.parentId) : null);
      }
      pendingIds = new Set(
        ancestors.flatMap((ancestor) => {
          const parentId = ancestor.parentId ? String(ancestor.parentId) : null;
          return parentId && !parentById.has(parentId) ? [parentId] : [];
        })
      );
    }

    // 仅保留没有命中祖先的删除入口：目录 owner 可以删除整棵子树，无需重复校验子文件 owner；
    // 正文已移出该子树时仍保留为独立入口，后续必须通过它自己的 owner 校验。
    const roots = [...matchedIds].filter((id) => {
      const visited = new Set([id]);
      let parentId = parentById.get(id);
      while (parentId && !visited.has(parentId)) {
        if (matchedIds.has(parentId)) return false;
        visited.add(parentId);
        parentId = parentById.get(parentId);
      }
      return true;
    });
    // 异常父子环会让所有命中项互相覆盖，退回全部命中项，宁可多重鉴权也不误删
    return roots.length ? roots : [...matchedIds];
  })();

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
