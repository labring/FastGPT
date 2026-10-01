import {
  CreateApiCollectionV2BodySchema,
  CreateApiCollectionV2ResponseSchema,
  type CreateApiCollectionV2BodyType,
  type CreateApiCollectionV2ResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import {
  API_FILE_FILE_COMMIT_TIMEOUT_MS,
  createApiFileCollectionsBatch,
  bulkInsertFolderCollections,
  bulkMoveCollectionsParent,
  type BulkInsertCollectionDoc,
  type BulkMoveCollectionParentItem
} from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import {
  buildApiFileRecords,
  buildApiFileTree,
  toApiFileDirId,
  type ApiFileRecord
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

  // 不传 parentId：请求体父级是兼容字段，落位不由它决定（见 createApiDatasetCollection），
  // 因此入口只校验 Dataset write，不再要求某个目录的写权限
  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId
  });

  // Check dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1
  });

  return CreateApiCollectionV2ResponseSchema.parse(
    await createApiDatasetCollection({
      ...body,
      teamId,
      tmbId,
      dataset
    })
  );
}

export default NextAPI(handler);

export const createApiDatasetCollection = async ({
  apiFiles,
  customPdfParse,
  teamId,
  tmbId,
  dataset,
  // 请求体父级是兼容字段，服务端不读：api 文件库的本地树镜像 server 树，用户导入时所处的
  // 浏览位置不参与落位。单独取出只为不让它漏进 body —— 否则会经 createCollectionParams
  // 重新影响落位，与「忽略该字段」的语义冲突
  parentId: _requestParentId,
  // 权限标记同理单独取出：它只作用于显式选中的节点，混进 ...body 会落到整棵展开树
  inheritPermission: requestInheritPermission,
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

  // 1b. 摊平成待落库记录：folder 只出目录记录；带子文档的 file 出「同名目录 + 正文」两条，
  //     于是子节点始终挂在一条真实的目录上，不会再出现「父是 file 导致 parentId 无解」
  const records = buildApiFileRecords(nodes);

  // 1c. 请求级 inheritPermission 只作用于**显式选中的节点**：它们的后代保持继承态，权限跟随
  //     选中的祖先（整库导入时只有根哨兵独立，全库继承它）。
  //     否则 4w 节点各自落独立态，给某个目录授权不会传给其子目录。
  //     #dir 是选中文件的同名目录，同属该节点，用与建树同一个函数派生，避免后缀口径漂移
  const selectedDirIds = new Set(
    apiFiles.flatMap((item) => [item.id, toApiFileDirId(item.id, item.type)])
  );
  /**
   * undefined = 保持继承（schema default），交回父级传播。
   *
   * 两点易被误判：① 全选时哨兵自身就是一条真实 collection 行（folder 的 dirId 即自身 id，
   * 故这里命中它），标记落在哨兵上、整棵展开树继承它——不是「落到空处」；② 标记只在**新建**
   * 记录时写入，已存在节点（existByApiFileId 命中）一律跳过、不改写 inheritPermission，
   * 与同步路径同口径。故重复导入时该字段无任何效果，这是有意的，不是丢参数。
   */
  const inheritPermissionOf = (record: ApiFileRecord) =>
    selectedDirIds.has(record.apiFileId) ? requestInheritPermission : undefined;

  // 2. 本地已有 collection：既用于幂等去重，也用于层级校正
  const existCollections = await MongoDatasetCollection.find(
    { teamId, datasetId: dataset._id },
    '_id apiFileId apiFileParentId parentId type inheritPermission'
  ).lean();
  const existByApiFileId = new Map(
    existCollections
      .filter((item) => item.apiFileId)
      .map((item) => [item.apiFileId as string, item])
  );

  // 轻量保护：同一个 apiFileId 已存在但记录类型不同，不能把已有正文当目录（或反过来）复用。
  // `#dir` 与本轮 provider id 的冲突已在 buildApiFileRecords 内检查；跨导入范围无法区分同类型来源，
  // 这里至少阻止会直接形成「子节点挂在 file 下」的确定性错层，不为低概率场景增加索引或迁移字段。
  for (const record of records) {
    const existing = existByApiFileId.get(record.apiFileId);
    if (!existing?.type) continue;

    const expectedType =
      record.type === 'folder'
        ? DatasetCollectionTypeEnum.folder
        : DatasetCollectionTypeEnum.apiFile;
    if (existing.type !== expectedType) {
      throw new Error(
        `Api file record type conflicts with existing collection: apiFileId=${record.apiFileId}, expected=${expectedType}, actual=${existing.type}`
      );
    }
  }

  // 3. 两套 id 表：idMap 只收「已落库的」collection，是新目录落库后才补入的
  const buildIdMap = (
    existMap: typeof existByApiFileId,
    fileRecords: ApiFileRecord[]
  ): { idMap: Map<string, Types.ObjectId>; newFolderIdMap: Map<string, Types.ObjectId> } => {
    const idMap = new Map<string, Types.ObjectId>();
    for (const [apiFileId, item] of existMap) {
      // lean 投影下 _id 声明为 string，构造回 ObjectId（与 BulkUpdateCollectionParentItem 的 parentId 类型一致）
      idMap.set(apiFileId, new Types.ObjectId(item._id));
    }

    const newFolderIdMap = new Map<string, Types.ObjectId>();
    for (const record of fileRecords) {
      if (record.type === 'folder' && !existMap.has(record.apiFileId)) {
        newFolderIdMap.set(record.apiFileId, new Types.ObjectId());
      }
    }
    return { idMap, newFolderIdMap };
  };
  const { idMap, newFolderIdMap } = buildIdMap(existByApiFileId, records);

  /** undefined 表示父目录尚未落库（其祖先写入失败），调用方须整棵跳过 */
  const resolveParentId = (record: ApiFileRecord): Types.ObjectId | null | undefined =>
    // 顶层记录（本次选中的最外层节点）没有 server 父级 → 落知识库根。
    // 不回退到请求体 parentId：浏览位置不参与落位，否则本地树会与 server 树分叉
    record.parentDirId === null ? null : idMap.get(record.parentDirId);

  // 校正条目：只跳过创建，不跳过校正 —— 否则「先导深层、再导祖先」必然错层。
  // 必须在本轮目录落库后调用，此时 idMap 才含新建目录的 _id
  const buildCorrections = (): BulkMoveCollectionParentItem[] => {
    const corrections: BulkMoveCollectionParentItem[] = [];

    for (const record of records) {
      const existing = existByApiFileId.get(record.apiFileId);
      // 本次选中的最外层节点保留其现有位置（用户显式选择优先于推导）
      if (!existing || record.parentDirId === null) continue;

      // parentDirId 非空 ⇒ serverParentId 非空 ⇒ apiFileParentId 非空
      const { apiFileParentId } = record;
      if (apiFileParentId === null) continue;

      const targetParentId = idMap.get(record.parentDirId);
      // 未命中只可能是该父目录本轮写入失败，整棵跳过
      if (!targetParentId) continue;

      const currentParentId = existing.parentId ? String(existing.parentId) : '';
      if (
        currentParentId === String(targetParentId) &&
        // apiFileParentId 历史数据可能是 undefined，统一按 null 归一后比较
        (existing.apiFileParentId ?? null) === apiFileParentId
      ) {
        continue;
      }

      corrections.push({
        _id: String(existing._id),
        datasetId: String(dataset._id),
        type: existing.type,
        inheritPermission: existing.inheritPermission,
        // 变更前的父级供 ACL 剥离旧继承位；必须是本次改动写入前的值
        oldParentId: existing.parentId ? String(existing.parentId) : null,
        newParentId: targetParentId,
        apiFileParentId
      });
    }

    return corrections;
  };

  let successCount = 0;
  let failedCount = 0;

  // 4. 目录按层 insertMany 建骨架。按层而非按序号：批失败是批级的，
  //    跨层分批会让同一批里父失败而子成功，留下 parentId 悬空的目录
  const dirRecords = records.filter((record) => record.type === 'folder');
  const dirDepths = Array.from(new Set(dirRecords.map((record) => record.depth))).sort(
    (a, b) => a - b
  );

  for (const depth of dirDepths) {
    const docs: BulkInsertCollectionDoc[] = [];

    for (const record of dirRecords) {
      // 已存在的目录只参与第 5 步的层级校正，不重复创建
      if (record.depth !== depth || existByApiFileId.has(record.apiFileId)) continue;

      const parentId = resolveParentId(record);
      // 未命中不等于回退：只可能是祖先目录本轮写入失败，整棵跳过（不回退到请求体 parentId）
      if (parentId === undefined) {
        failedCount++;
        continue;
      }

      docs.push({
        _id: newFolderIdMap.get(record.apiFileId)!,
        name: record.name,
        type: DatasetCollectionTypeEnum.folder,
        apiFileId: record.apiFileId,
        // 归一：无 server 父级时不写该字段，与下面的 file 侧落库形态一致
        apiFileParentId: record.apiFileParentId ?? undefined,
        parentId,
        inheritPermission: inheritPermissionOf(record)
      });
    }

    const { successApiFileIds, failedApiFileIds } = await bulkInsertFolderCollections({
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

  // 5. 校正已存在节点的层级。
  // 必须在上面目录逐层落库的循环之后调用：idMap 在该循环里才补入新目录的 _id。
  // 取舍：以 server 层级为准，挂在自建（无 apiFileId）文件夹下的节点会被重挂到 server 真实父级。
  // 若产品改为「用户显式摆放优先」，在此处跳过 parentId 指向自建文件夹的节点即可
  const corrections = buildCorrections();

  if (corrections.length > 0) {
    // ACL 迁移必须先于 parentId 写入（要读变更前的父级），两者同一事务
    const correctionResult = await mongoSessionRun((session) =>
      bulkMoveCollectionsParent({ teamId, items: corrections, session })
    );

    if (correctionResult.failedIds.length) {
      // 40k 文件规模下 failedIds 可能极长，只带前 10 条做样本，完整数量见 failedCount
      logger.warn('Create api file collection parent update failed', {
        teamId,
        datasetId: String(dataset._id),
        failedCount: correctionResult.failedIds.length,
        failedIdsSample: correctionResult.failedIds.slice(0, 10)
      });
    }
    // matchedCount < 实际提交数：目标行在读取快照后被删/重建，$set 命中 0 条且驱动不报错
    if (correctionResult.matchedCount < corrections.length) {
      logger.warn('Create api file collection parent correction not fully matched', {
        teamId,
        datasetId: String(dataset._id),
        correctionCount: corrections.length,
        matchedCount: correctionResult.matchedCount
      });
    }
  }

  // 6. file 单事务整批写入：全部落库或全部回滚，不做部分成功。
  //    目标环境已用 10 万条完整数据验证该路径；保持单事务是明确的原子性取舍，事务生命周期配置
  //    必须与压测环境一致。maxCommitTimeMS 只放宽提交阶段，不替代服务端事务生命周期配置。
  const fileRecords = records.filter((record) => record.type === 'file');
  const writable: Array<{ record: ApiFileRecord; parentId: Types.ObjectId | null }> = [];

  for (const record of fileRecords) {
    // 已落库的 file 只参与上面的层级校正，不重复创建
    if (existByApiFileId.has(record.apiFileId)) continue;

    const parentId = resolveParentId(record);
    // 未命中不等于回退：只可能是祖先目录本轮写入失败，整棵跳过，重新导入即可幂等补齐。
    // null 是合法值（顶层记录 → 落在知识库根）
    if (parentId === undefined) {
      failedCount++;
      continue;
    }
    writable.push({ record, parentId });
  }

  if (writable.length > 0) {
    try {
      await mongoSessionRun(
        async (session) => {
          await createApiFileCollectionsBatch({
            dataset,
            files: writable.map(({ record, parentId }) => ({
              name: record.name,
              apiFileId: record.apiFileId,
              // 归一：无 server 父级时不写该字段，与单条路径 createOneCollection 的落库形态一致
              apiFileParentId: record.apiFileParentId ?? undefined,
              parentId: parentId ? String(parentId) : undefined,
              inheritPermission: inheritPermissionOf(record),
              metadata: { relatedImgId: record.apiFileId }
            })),
            createCollectionParams: {
              ...body,
              teamId,
              tmbId,
              type: DatasetCollectionTypeEnum.apiFile,
              customPdfParse
            },
            session
          });
        },
        // 整批（4w 量级）一个事务，默认 60s 提交上限不够
        { maxCommitTimeMS: API_FILE_FILE_COMMIT_TIMEOUT_MS }
      );
      successCount += writable.length;
    } catch (error) {
      // 事务已整体回滚，无部分成功（含配额不足、模型解析失败、事务超时）：整批计入失败。
      // 必须抛出让调用方感知 —— 客户端只在请求 reject 时才把文件标为失败，返回 200 会让
      // 用户看到「导入成功」而实际一个文件都没进去（最坏只剩目录骨架）
      logger.warn('Create api file collection batch failed', {
        teamId,
        datasetId: String(dataset._id),
        batchSize: writable.length,
        succeededCount: successCount,
        error
      });
      throw error;
    }
  }

  logger.info('Create api file collection completed', {
    teamId,
    datasetId: String(dataset._id),
    nodeCount: nodes.length,
    folderCount: dirRecords.length,
    fileCount: fileRecords.length,
    successCount,
    failedCount
  });

  return { successCount, failedCount };
};
