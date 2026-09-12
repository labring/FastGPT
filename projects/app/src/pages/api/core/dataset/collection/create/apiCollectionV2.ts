import {
  CreateApiCollectionV2BodySchema,
  type CreateApiCollectionV2BodyType,
  type CreateApiCollectionV2ResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import {
  createCollectionAndInsertData,
  bulkInsertCollections,
  bulkUpdateCollectionsParent,
  API_FILE_FILE_BATCH_SIZE,
  type BulkInsertCollectionDoc,
  type BulkUpdateCollectionParentItem
} from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import {
  buildApiFileTree,
  type ApiFileTreeNode
} from '@fastgpt/service/core/dataset/apiDataset/tree';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { Types } from '@fastgpt/service/common/mongo';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import type { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const logger = getLogger(LogCategories.MODULE.DATASET);

async function handler(req: ApiRequestProps<CreateApiCollectionV2BodyType>) {
  const body = parseApiInput({ req, bodySchema: CreateApiCollectionV2BodySchema }).body;

  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    parentId: body.parentId
  });

  // Check dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1
  });

  return createApiDatasetCollection({
    ...body,
    teamId,
    tmbId,
    dataset
  });
}

export default NextAPI(handler);

export const createApiDatasetCollection = async ({
  apiFiles,
  customPdfParse,
  teamId,
  tmbId,
  dataset,
  ...body
}: CreateApiCollectionV2BodyType & {
  teamId: string;
  tmbId: string;
  dataset: DatasetSchemaType & {
    permission: DatasetPermission;
  };
}): Promise<CreateApiCollectionV2ResponseType> => {
  const startId =
    dataset.apiDatasetServer?.apiServer?.basePath ||
    dataset.apiDatasetServer?.yuqueServer?.basePath ||
    dataset.apiDatasetServer?.feishuServer?.folderToken ||
    dataset.apiDatasetServer?.dingtalkServer?.rootNodeId;

  const request = await getApiDatasetRequest(dataset.apiDatasetServer);

  // 1. 拉 server 树（父先子后）。拉取失败直接抛出，本轮不写任何数据
  const nodes = await buildApiFileTree({
    request,
    seeds: apiFiles.map((item) => ({
      ...item,
      // 根哨兵不是真实 server 节点，展开子级要用知识库根
      ...(item.id === RootCollectionId ? { listId: startId } : {})
    }))
  });

  // 2. 本地已有 collection：既用于幂等去重，也用于层级校正
  const existCollections = await MongoDatasetCollection.find(
    { teamId, datasetId: dataset._id },
    '_id apiFileId apiFileParentId parentId'
  ).lean();
  const existByApiFileId = new Map(
    existCollections
      .filter((item) => item.apiFileId)
      .map((item) => [item.apiFileId as string, item])
  );

  // 3. 两套 id 表：idMap 只收「已落库的」collection，是新 folder 落库后才补入的
  const buildIdMap = (
    existMap: typeof existByApiFileId,
    treeNodes: ApiFileTreeNode[]
  ): { idMap: Map<string, Types.ObjectId>; newFolderIdMap: Map<string, Types.ObjectId> } => {
    const idMap = new Map<string, Types.ObjectId>();
    for (const [apiFileId, item] of existMap) {
      // lean 投影下 _id 声明为 string，构造回 ObjectId（与 BulkUpdateCollectionParentItem 的 parentId 类型一致）
      idMap.set(apiFileId, new Types.ObjectId(item._id));
    }

    const newFolderIdMap = new Map<string, Types.ObjectId>();
    for (const node of treeNodes) {
      if (node.type === 'folder' && !existMap.has(node.serverId)) {
        newFolderIdMap.set(node.serverId, new Types.ObjectId());
      }
    }
    return { idMap, newFolderIdMap };
  };
  const { idMap, newFolderIdMap } = buildIdMap(existByApiFileId, nodes);

  const bodyParentId = body.parentId ? new Types.ObjectId(body.parentId) : null;
  /** undefined 表示父级尚未落库（其祖先写入失败），调用方须整棵跳过 */
  const resolveParentId = (node: ApiFileTreeNode): Types.ObjectId | null | undefined =>
    node.serverParentId === null ? bodyParentId : idMap.get(node.serverParentId);

  // 校正条目：只跳过创建，不跳过校正 —— 否则「先导深层、再导祖先」必然错层。
  // 必须在本轮 folder 落库后调用，此时 idMap 才含新 folder 的 _id
  const buildCorrections = (): BulkUpdateCollectionParentItem[] => {
    const corrections: BulkUpdateCollectionParentItem[] = [];

    for (const node of nodes) {
      const existing = existByApiFileId.get(node.serverId);
      // 本次选中的最外层节点保留其现有位置（用户显式选择优先于推导）
      if (!existing || node.serverParentId === null) continue;

      const targetParentId = idMap.get(node.serverParentId);
      if (!targetParentId) continue;

      const currentParentId = existing.parentId ? String(existing.parentId) : '';
      if (
        currentParentId === String(targetParentId) &&
        existing.apiFileParentId === node.serverParentId
      ) {
        continue;
      }

      corrections.push({
        _id: String(existing._id),
        parentId: targetParentId,
        apiFileParentId: node.serverParentId
      });
    }

    return corrections;
  };

  let successCount = 0;
  let failedCount = 0;

  // 4. folder 按层 insertMany 建骨架。按层而非按序号：批失败是批级的，
  //    跨层分批会让同一批里父失败而子成功，留下 parentId 悬空的 folder
  const folderNodes = nodes.filter((node) => node.type === 'folder');
  const folderDepths = Array.from(new Set(folderNodes.map((node) => node.depth))).sort(
    (a, b) => a - b
  );

  for (const depth of folderDepths) {
    const docs: BulkInsertCollectionDoc[] = [];

    for (const node of folderNodes) {
      // 已存在的 folder 只参与第 5 步的层级校正，不重复创建
      if (node.depth !== depth || existByApiFileId.has(node.serverId)) continue;

      const parentId = resolveParentId(node);
      // 未命中不等于回退：只可能是祖先 folder 本轮写入失败，整棵跳过（不回退到请求体 parentId）
      if (parentId === undefined) {
        failedCount++;
        continue;
      }

      docs.push({
        _id: newFolderIdMap.get(node.serverId)!,
        name: node.name,
        type: DatasetCollectionTypeEnum.folder,
        apiFileId: node.serverId,
        apiFileParentId: node.serverParentId,
        parentId
      });
    }

    const { successApiFileIds, failedApiFileIds } = await bulkInsertCollections({
      teamId,
      tmbId,
      datasetId: String(dataset._id),
      docs
    });

    for (const apiFileId of successApiFileIds) {
      const _id = newFolderIdMap.get(apiFileId);
      if (_id) idMap.set(apiFileId, _id);
    }
    successCount += successApiFileIds.length;
    failedCount += failedApiFileIds.length;
  }

  // 5. 校正已存在节点的层级
  const corrections = buildCorrections();

  // 取舍：以 server 层级为准，挂在自建（无 apiFileId）文件夹下的节点会被重挂到 server 真实父级。
  // 若产品改为「用户显式摆放优先」，在此处跳过 parentId 指向自建文件夹的节点即可（见设计文档 §3.2.2.1 取舍说明）
  const correctionResult = await bulkUpdateCollectionsParent({ teamId, updates: corrections });
  failedCount += correctionResult.failedIds.length;

  // 6. file 分段事务写入
  const fileNodes = nodes.filter((node) => node.type !== 'folder');
  for (let i = 0; i < fileNodes.length; i += API_FILE_FILE_BATCH_SIZE) {
    const writable: Array<{ node: ApiFileTreeNode; parentId: Types.ObjectId | null }> = [];

    for (const node of fileNodes.slice(i, i + API_FILE_FILE_BATCH_SIZE)) {
      // 已落库的 file 只参与上面的层级校正，不重复创建
      if (existByApiFileId.has(node.serverId)) continue;

      const parentId = resolveParentId(node);
      // 未命中不等于回退：只可能是祖先 folder 本轮写入失败，整棵跳过，重新导入即可幂等补齐。
      // null 是合法值（serverParentId 为空且请求体未传 parentId → 落在知识库根）
      if (parentId === undefined) {
        failedCount++;
        continue;
      }
      writable.push({ node, parentId });
    }
    if (writable.length === 0) continue;

    try {
      await mongoSessionRun(async (session) => {
        for (const { node, parentId } of writable) {
          await createCollectionAndInsertData({
            dataset,
            createCollectionParams: {
              ...body,
              // 必须写在 ...body 之后：body.parentId 是用户选中的父级，会覆盖查表结果
              parentId: parentId ? String(parentId) : undefined,
              teamId,
              tmbId,
              type: DatasetCollectionTypeEnum.apiFile,
              name: node.name,
              apiFileId: node.serverId,
              apiFileParentId: node.serverParentId ?? undefined,
              metadata: { relatedImgId: node.serverId },
              customPdfParse
            },
            session
          });
        }
      });
      successCount += writable.length;
    } catch (error) {
      logger.warn('Create api file collection batch failed', {
        teamId,
        datasetId: String(dataset._id),
        batchSize: writable.length,
        error
      });
      failedCount += writable.length;
    }
  }

  return { successCount, failedCount };
};
