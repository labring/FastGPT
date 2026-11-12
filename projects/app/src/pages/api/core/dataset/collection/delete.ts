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
    // 带子文档的文件会拆成「派生目录 + 正文」两条记录，子文档挂在目录下且有 apiFileSourceId 来源标记；
    // 只按 apiFileId 命中正文会残留目录和子文档，必须同时按来源标记取出派生目录。
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
    // 集合所有权可以单独转移到正文而不转移父目录。只要有命中祖先负责删除整棵子树，
    // 该节点就不再作为独立根要求 owner，否则目录 owner 无法按外部 ID 清理整棵树。
    // 祖先链中间可能夹着无外部身份的自建目录，必须沿 parentId 向上补齐而不是只看直接父级；
    // 正文真正移出命中子树时仍以正文自身为根，单有正文的调用者依旧会被拒绝。
    const matchedIds = new Set(matched.map((item) => String(item._id)));
    const parentOf = new Map<string, string | null>(
      matched.map((item) => [String(item._id), item.parentId ? String(item.parentId) : null])
    );
    const isCoveredByMatchedAncestor = async (id: string) => {
      // visited 防御异常 parentId 环，避免补齐祖先链时死循环或把节点误判为被自身覆盖
      const visited = new Set([id]);
      let parentId = parentOf.get(id) ?? null;
      while (parentId) {
        if (visited.has(parentId)) return false;
        visited.add(parentId);
        if (matchedIds.has(parentId)) return true;
        if (!parentOf.has(parentId)) {
          const ancestor = await MongoDatasetCollection.findOne(
            { _id: parentId, teamId, datasetId },
            'parentId'
          ).lean();
          parentOf.set(parentId, ancestor?.parentId ? String(ancestor.parentId) : null);
        }
        parentId = parentOf.get(parentId) ?? null;
      }
      return false;
    };

    const roots: string[] = [];
    for (const item of matched) {
      const id = String(item._id);
      if (!(await isCoveredByMatchedAncestor(id))) roots.push(id);
    }
    // 异常父子环会让所有命中项互相覆盖，退回全部命中项，宁可多重鉴权也不误删
    return roots.length ? roots : matched.map((item) => String(item._id));
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
