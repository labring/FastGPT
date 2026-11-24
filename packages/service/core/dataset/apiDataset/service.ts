import type {
  ApiCreateDatasetCollectionParams,
  CreateApiCollectionV2BodyType,
  CreateApiCollectionV2ResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import {
  API_FILE_FILE_COMMIT_TIMEOUT_MS,
  createApiFileCollectionsBatch,
  bulkInsertFolderCollections,
  bulkMoveCollectionsParent,
  type BulkMoveCollectionParentItem,
  type DatasetModelAuthContext
} from '../collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { MongoDataset } from '../schema';
import { MongoDatasetCollection } from '../collection/schema';
import { getApiDatasetRequest } from './index';
import {
  buildApiFileRecords,
  buildApiFileTree,
  toApiFileDirId,
  type ApiFileRecord,
  type ApiFileTreeSeed
} from './tree';
import {
  buildApiFileParentUpdates,
  LEGACY_SYSTEM_ROOT_API_FILE_ID,
  resolveApiDatasetProvider,
  resolveApiFileRecordParent,
  planLegacyApiFileFolders,
  usesDingtalkDataset,
  type LegacyApiFileFolderMigration
} from './utils';
import type { ApiFileImportChanges } from './auth';
import { planApiFileFolders, createApiFileFolders } from './folder';
import { assertParentPlanAcyclic } from '../../../common/parentFolder/parentPlan';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { Types, type ClientSession } from '../../../common/mongo';
import { UserError } from '@fastgpt/global/common/error/utils';
import { lockDatasetCollectionPermissionState } from '../../../support/permission/collection/datasetSwitch';
import { getLogger, LogCategories } from '../../../common/logger';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../../../support/permission/schema';

const logger = getLogger(LogCategories.MODULE.DATASET);

export type CleanDatasetLegacySystemRootResult = {
  sentinels: number;
  reparented: number;
};

/**
 * 在已有事务内清理单个 API 知识库的历史 SYSTEM_ROOT 哨兵集合：
 * 1. 若知识库启用了集合级权限且哨兵为独立权限（inheritPermission=false），将直接继承态子节点
 *    标记为 inheritPermission=false 以保留其既有物化快照，防止重挂到根后发生权限漂移；
 * 2. 将哨兵下的直接子节点重挂到知识库根（parentId=null），并移除残留 apiFileParentId='SYSTEM_ROOT'；
 * 3. 删除哨兵自身的 ResourcePermission 记录，避免孤儿权限行；
 * 4. 按调用方需求决定是否回填 Dataset.syncAll = true（手动清理迁移传 true；主动关闭 syncAll / 删文件传 false）；
 * 5. 删除哨兵集合。
 *
 * 重复执行安全：目标已清理时只读返回零变更。
 */
export const cleanDatasetLegacySystemRootInSession = async ({
  datasetId,
  session,
  backfillSyncAll = false
}: {
  datasetId: string | Types.ObjectId;
  session: ClientSession;
  backfillSyncAll?: boolean;
}): Promise<CleanDatasetLegacySystemRootResult> => {
  const datasetObjectId = typeof datasetId === 'string' ? new Types.ObjectId(datasetId) : datasetId;

  const [sentinels, dataset] = await Promise.all([
    MongoDatasetCollection.find(
      {
        datasetId: datasetObjectId,
        apiFileId: LEGACY_SYSTEM_ROOT_API_FILE_ID
      },
      '_id teamId datasetId inheritPermission'
    )
      .lean()
      .session(session),
    MongoDataset.findById(datasetObjectId, '_id teamId collectionPermissionEnabled')
      .lean()
      .session(session)
  ]);

  const sentinelIds = sentinels.map((s) => s._id);
  const sentinelIdStrings = sentinelIds.map(String);
  let reparented = 0;

  if (sentinelIds.length > 0) {
    const independentSentinelIds = sentinels
      .filter((s) => s.inheritPermission === false)
      .map((s) => s._id);

    // 启用集合级权限且哨兵自身是独立权限时，保留子节点当前物化快照而不自动改继承 Dataset ACL
    if (dataset?.collectionPermissionEnabled === true && independentSentinelIds.length > 0) {
      const res = await MongoDatasetCollection.updateMany(
        {
          datasetId: datasetObjectId,
          parentId: { $in: independentSentinelIds },
          inheritPermission: { $ne: false }
        },
        { $set: { parentId: null, inheritPermission: false } },
        { session }
      );
      reparented += res.modifiedCount;
    }

    const restRes = await MongoDatasetCollection.updateMany(
      {
        datasetId: datasetObjectId,
        parentId: { $in: sentinelIds }
      },
      { $set: { parentId: null } },
      { session }
    );
    reparented += restRes.modifiedCount;

    const teamIds = Array.from(
      new Set(
        [...sentinels.map((s) => String(s.teamId)), ...(dataset ? [String(dataset.teamId)] : [])]
          .filter(Boolean)
          .map((id) => new Types.ObjectId(id))
      )
    );

    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.collection,
        ...(teamIds.length > 0 ? { teamId: { $in: teamIds } } : {}),
        resourceId: { $in: sentinelIdStrings }
      },
      { session }
    );

    if (backfillSyncAll && dataset) {
      await MongoDataset.updateOne({ _id: dataset._id }, { $set: { syncAll: true } }, { session });
    }

    await MongoDatasetCollection.deleteMany({ _id: { $in: sentinelIds } }, { session });
  }

  await MongoDatasetCollection.updateMany(
    {
      datasetId: datasetObjectId,
      apiFileParentId: LEGACY_SYSTEM_ROOT_API_FILE_ID
    },
    { $unset: { apiFileParentId: '' } },
    { session }
  );

  return {
    sentinels: sentinelIds.length,
    reparented
  };
};

/**
 * 在同一事务内关闭 API 知识库整库全量同步，并同步拆除存量 SYSTEM_ROOT 哨兵（保留存活子节点与独立权限快照）。
 * 统一供 dataset/update（关闭 syncAll）、collection/update（暂停目录）与 collection/delete（删除 API 集合）复用，
 * 避免哨兵残留导致 syncState/detail/Pro 继续将其判定为 syncAll = true。
 */
export const disableApiDatasetSyncAllInSession = async ({
  teamId,
  datasetId,
  session,
  updateDataset = true,
  cleanLegacySystemRoot = true
}: {
  teamId: string | Types.ObjectId;
  datasetId: string | Types.ObjectId;
  session: ClientSession;
  updateDataset?: boolean;
  cleanLegacySystemRoot?: boolean;
}) => {
  if (updateDataset) {
    await MongoDataset.updateOne(
      { _id: datasetId, teamId, syncAll: true },
      { $set: { syncAll: false } },
      { session }
    );
  }
  if (cleanLegacySystemRoot) {
    await cleanDatasetLegacySystemRootInSession({
      datasetId,
      session,
      backfillSyncAll: false
    });
  }
};

/**
 * 在同一事务内原子开启 API 知识库整库全量同步：
 * 1. 置 Dataset.syncAll = true（当调用方已在同一事务中更新 Dataset 时可通过 updateDataset=false 跳过）；
 * 2. 恢复本知识库内全部已暂停（syncChildren: false）的 API 目录，保证整库同步与局部目录状态一致。
 * 调用方必须先完成知识库 Manage 权限校验。
 */
export const applyApiDatasetSyncAll = async ({
  teamId,
  datasetId,
  session,
  updateDataset = true
}: {
  teamId: string;
  datasetId: string | Types.ObjectId;
  session?: ClientSession;
  updateDataset?: boolean;
}) => {
  const apply = async (tx: ClientSession) => {
    if (updateDataset) {
      await MongoDataset.updateOne(
        { _id: datasetId, teamId },
        { $set: { syncAll: true } },
        { session: tx }
      );
    }
    await MongoDatasetCollection.updateMany(
      {
        teamId,
        datasetId,
        type: DatasetCollectionTypeEnum.folder,
        apiFileId: { $exists: true, $ne: null },
        syncChildren: false
      },
      { $set: { syncChildren: true } },
      { session: tx }
    );
  };

  if (session) {
    await apply(session);
  } else {
    await mongoSessionRun(apply);
  }
};

/**
 * 提交已鉴权的旧目录身份转换；本地 ID、父级和 ACL 不变，元数据使用字段更新保留其他配置。
 * 比较计划时的身份、父级及继承状态，任一失效整批回滚；转换标记让正文入队失败后仍可重试。
 */
export const applyLegacyApiFileFolders = async ({
  teamId,
  datasetId,
  migrations,
  session
}: {
  teamId: string;
  datasetId: string;
  migrations: LegacyApiFileFolderMigration[];
  session?: ClientSession;
}) => {
  if (migrations.length === 0) return;
  const apply = async (transaction: ClientSession) => {
    // 与本库的目录创建/移动串行提交，避免规划后并发生成相同派生身份。
    await lockDatasetCollectionPermissionState({ teamId, datasetId, session: transaction });
    for (let offset = 0; offset < migrations.length; offset += 1000) {
      const batch = migrations.slice(offset, offset + 1000);
      const conflicts = await MongoDatasetCollection.find(
        { teamId, datasetId, apiFileId: { $in: batch.map((item) => item.directoryId) } },
        '_id'
      )
        .session(transaction)
        .lean();
      if (conflicts.length) {
        throw new UserError(
          'Legacy API file directory identity has changed',
          '文件位置或权限已变更，请重试'
        );
      }
      const result = await MongoDatasetCollection.bulkWrite(
        batch.map((item) => ({
          updateOne: {
            filter: {
              _id: item.collectionId,
              teamId,
              datasetId,
              type: DatasetCollectionTypeEnum.folder,
              apiFileId: item.sourceId,
              parentId: item.oldParentId,
              inheritPermission: item.inheritPermission === false ? false : { $ne: false },
              'metadata.apiFileSourceId': { $exists: false }
            },
            update: {
              $set: {
                apiFileId: item.directoryId,
                'metadata.apiFileSourceId': item.sourceId,
                'metadata.apiFileLegacyDocument': true
              }
            }
          }
        })),
        { session: transaction, ordered: true }
      );
      if (result.matchedCount !== batch.length) {
        throw new UserError(
          'Legacy API file folder plan has changed',
          '文件位置或权限已变更，请重试'
        );
      }
    }
  };
  return session ? apply(session) : mongoSessionRun(apply);
};

/**
 * 按远端层级导入 API 文件库并校正已有节点的父级。
 * 内部调用保留权限继承参数；HTTP 入口沿用创建接口约束，由请求 schema 去除该字段。
 */
export const createApiDatasetCollection = async ({
  apiFiles = [],
  syncAll = false,
  ancestorPaths,
  authorizeChanges,
  customPdfParse,
  modelAuthContext,
  teamId,
  tmbId,
  dataset,
  // 请求体 parentId 被忽略（V2 本地树镜像 server 树），仅显式传入的 targetParentId 生效（供 V1 路由使用）
  parentId: _requestParentId,
  targetParentId,
  // 内部调用的权限标记单独取出：它只作用于显式选中的节点，混进 ...body 会落到整棵展开树
  inheritPermission: requestInheritPermission,
  ...body
}: CreateApiCollectionV2BodyType &
  Pick<ApiCreateDatasetCollectionParams, 'inheritPermission'> & {
    /** HTTP 调用方必须传入实际变更计划鉴权；worker 等可信内部调用不经过用户鉴权。 */
    authorizeChanges?: (changes: ApiFileImportChanges) => Promise<void>;
    modelAuthContext?: DatasetModelAuthContext;
    teamId: string;
    tmbId: string;
    /** 仅供 V1 内部调用指定落位，V2 HTTP 入参不开放此字段。 */
    targetParentId?: CreateApiCollectionV2BodyType['parentId'];
    dataset: DatasetSchemaType & {
      permission: DatasetPermission;
    };
  }): Promise<CreateApiCollectionV2ResponseType> => {
  // 升级过渡期兼容：旧导入页面（<= v4.17.5）全选整库时会传入 apiFileId='SYSTEM_ROOT' 哨兵。
  // 在入口边界将其归一为 syncAll=true 并剥离哨兵，防止 SYSTEM_ROOT 流入普通节点建树或再次写入库中。
  const hasLegacySystemRootSelection = apiFiles.some(
    (item) => item.id === LEGACY_SYSTEM_ROOT_API_FILE_ID
  );
  const effectiveSyncAll = Boolean(syncAll) || hasLegacySystemRootSelection;
  const sanitizedApiFiles = apiFiles.filter((item) => item.id !== LEGACY_SYSTEM_ROOT_API_FILE_ID);

  if (!effectiveSyncAll && sanitizedApiFiles.length === 0) {
    return { successCount: 0, failedCount: 0 };
  }

  const startId = resolveApiDatasetProvider(dataset.apiDatasetServer)?.basePath;

  const request = await getApiDatasetRequest(dataset.apiDatasetServer);
  const listFilesCache = new Map<string, Promise<APIFileItemType[]>>();
  /** 单次导入请求内复用同一 parentId 的 listFiles 结果，减少祖先校验与子树展开的重复调用。 */
  const cachedListFiles = (parentId?: string | null) => {
    const cacheKey = parentId === null || parentId === undefined ? '__ROOT__' : `id:${parentId}`;
    let pending = listFilesCache.get(cacheKey);
    if (!pending) {
      pending = request.listFiles({ parentId });
      listFilesCache.set(cacheKey, pending);
    }
    return pending;
  };
  const cachedRequest = {
    ...request,
    listFiles: ({ parentId }: { parentId?: string | null }) => cachedListFiles(parentId)
  };

  // 1. 本地快照同时用于幂等匹配、旧目录识别、恢复同步判定与后续移动计划。
  const localCollections = await MongoDatasetCollection.find(
    { teamId, datasetId: dataset._id },
    '_id apiFileId apiFileParentId parentId type inheritPermission metadata syncChildren'
  ).lean();
  const localByApiId = new Map(localCollections.map((item) => [item.apiFileId, item]));
  const legacySourceIds = new Set(
    localCollections.flatMap((item) => {
      if (item.type !== DatasetCollectionTypeEnum.folder) return [];
      if (item.metadata?.apiFileSourceId === undefined)
        return item.apiFileId ? [item.apiFileId] : [];
      return item.metadata.apiFileLegacyDocument === true &&
        typeof item.metadata.apiFileSourceId === 'string'
        ? [item.metadata.apiFileSourceId]
        : [];
    })
  );

  // 2. 构造建树种子：
  //    - syncAll=true：直接拉取远端根目录全部节点展开整棵树，不再创建 SYSTEM_ROOT 哨兵；
  //    - 局部导入：若携带 ancestorPaths，则自顶向下调用 listFiles 校验每条祖先链，
  //      为未显式选中的祖先生成 syncChildren=false 的占位种子，保证本地树镜像远端目录结构。
  const buildImportSeeds = async (): Promise<{
    treeSeeds: ApiFileTreeSeed[];
    explicitSeeds: Array<Pick<APIFileItemType, 'id' | 'type'>>;
  }> => {
    if (effectiveSyncAll) {
      const rootItems = await cachedListFiles(startId);
      const rootSeeds: ApiFileTreeSeed[] = rootItems.map((item) => ({
        ...item,
        serverParentId: null,
        syncChildren: true,
        expandChildren: true,
        isAutoAncestor: false
      }));
      return { treeSeeds: rootSeeds, explicitSeeds: rootItems };
    }

    // V2 根信息来自客户端。兼容旧目录前使用真实详情更新类型和 hasChild，防止旧页面信息漏掉子树。
    const verifiedApiFiles = await (async () => {
      if (!usesDingtalkDataset(dataset.apiDatasetServer)) return sanitizedApiFiles;
      const verified: typeof sanitizedApiFiles = [];
      const details = new Map<string, ReturnType<typeof request.getFileDetail>>();
      for (const item of sanitizedApiFiles) {
        if (
          !legacySourceIds.has(item.id) ||
          localByApiId.get(item.id)?.type === DatasetCollectionTypeEnum.apiFile
        ) {
          verified.push(item);
          continue;
        }
        if (!details.has(item.id))
          details.set(item.id, request.getFileDetail({ apiFileId: item.id }));
        const detail = await details.get(item.id)!;
        if (!detail.success)
          throw new UserError('Legacy API file source verification failed', detail.message);
        if (detail.data.id !== item.id || (item.type === 'file' && detail.data.type !== 'file')) {
          throw new UserError(
            'Legacy API file source type has changed',
            '文件类型与远端不一致，请刷新后重试'
          );
        }
        verified.push(detail.data);
      }
      return verified;
    })();

    const explicitSelectedIds = new Set(verifiedApiFiles.map((item) => item.id));
    const autoAncestorSeeds = new Map<string, ApiFileTreeSeed>();
    const explicitTreeSeeds: ApiFileTreeSeed[] = [];

    for (const item of verifiedApiFiles) {
      const rawPath = ancestorPaths?.[item.id];
      const path =
        rawPath?.filter((id) => Boolean(id) && id !== LEGACY_SYSTEM_ROOT_API_FILE_ID) ?? [];
      if (path.length === 0) {
        explicitTreeSeeds.push({
          ...item,
          serverParentId: null,
          syncChildren: true,
          expandChildren: true,
          isAutoAncestor: false
        });
        continue;
      }

      // 服务端自顶向下校验祖先链，仅采用 listFiles 返回的远端真实元信息，拒绝伪造路径或名称。
      let currentParentId: string | null = null;
      for (const ancestorId of path) {
        const listParentId = currentParentId === null ? startId : currentParentId;
        const levelItems = await cachedListFiles(listParentId);
        const matchedAncestor = levelItems.find((candidate) => candidate.id === ancestorId);
        if (!matchedAncestor) {
          throw new UserError(
            `Remote ancestor directory not found: ${ancestorId}`,
            '远端目录结构已变更，请刷新后重试'
          );
        }
        if (
          !explicitSelectedIds.has(matchedAncestor.id) &&
          !autoAncestorSeeds.has(matchedAncestor.id)
        ) {
          autoAncestorSeeds.set(matchedAncestor.id, {
            ...matchedAncestor,
            serverParentId: currentParentId,
            syncChildren: false,
            expandChildren: false,
            isAutoAncestor: true
          });
        }
        currentParentId = matchedAncestor.id;
      }

      const leafLevelItems = await cachedListFiles(currentParentId);
      const matchedItem = leafLevelItems.find((candidate) => candidate.id === item.id);
      if (!matchedItem) {
        throw new UserError(
          `Remote file not found under ancestor path: ${item.id}`,
          '远端目录结构已变更，请刷新后重试'
        );
      }
      explicitTreeSeeds.push({
        ...matchedItem,
        serverParentId: currentParentId,
        syncChildren: true,
        expandChildren: true,
        isAutoAncestor: false
      });
    }

    return {
      treeSeeds: [...autoAncestorSeeds.values(), ...explicitTreeSeeds],
      explicitSeeds: explicitTreeSeeds
    };
  };

  const { treeSeeds, explicitSeeds } = await buildImportSeeds();

  // 2a. 拉 server 树（父先子后）。拉取失败直接抛出，本轮不写任何数据
  const nodes = await buildApiFileTree({
    request: cachedRequest,
    seeds: treeSeeds
  });

  // 2b. 摊平成待落库记录：folder 只出目录记录；带子文档的 file 出「同名目录 + 正文」两条，
  //     于是子节点始终挂在一条真实的目录上，不会再出现「父是 file 导致 parentId 无解」
  const remoteRecords = buildApiFileRecords(nodes);

  // 2c. 请求级 inheritPermission 只作用于**显式选中的节点**（全选时作用于远端根下顶层节点）：
  //     自动补建的祖先目录及其后代保持继承态，已存在节点跳过不改写 inheritPermission。
  const selectedDirIds = new Set(
    explicitSeeds.flatMap((item) => [item.id, toApiFileDirId(item.id, item.type)])
  );
  const inheritPermissionOf = (record: ApiFileRecord) =>
    selectedDirIds.has(record.apiFileId) ? requestInheritPermission : undefined;

  // 2d. 旧目录只改变远端身份；实际写入仍在完整计划校验与鉴权之后。
  const legacyPlan = planLegacyApiFileFolders({
    records: remoteRecords,
    collections: localCollections,
    apiDatasetServer: dataset.apiDatasetServer
  });
  const records = legacyPlan.records;
  const existCollections = legacyPlan.collections;
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

  // 3. 已提交映射与预分配目录 ID 分开，鉴权计划不能提前影响实际落库。
  const idMap = new Map(
    [...existByApiFileId].map(([apiFileId, item]) => [apiFileId, String(item._id)])
  );
  const folderPlan = planApiFileFolders({ records, idMap });

  // 升级过渡期兼容：若库内仍存在未迁移的 SYSTEM_ROOT 哨兵且未指定落位目录，
  // 保持顶层记录继续挂在哨兵下（与 Pro 同步逻辑对称），避免触发多余的移动与权限变更，等待手动迁移一次性无损重挂。
  const legacySystemRootCollection = localCollections.find(
    (item) => item.apiFileId === LEGACY_SYSTEM_ROOT_API_FILE_ID
  );
  const legacySystemRootId = legacySystemRootCollection
    ? String(legacySystemRootCollection._id)
    : undefined;
  const effectiveRootParentIds = new Map(legacyPlan.rootParentIds);
  if (legacySystemRootId && !targetParentId) {
    for (const record of records) {
      if (record.parentDirId === null && !effectiveRootParentIds.has(record.sourceId)) {
        effectiveRootParentIds.set(record.sourceId, legacySystemRootId);
      }
    }
  }

  const parentOptions = {
    idMap,
    targetParentId,
    rootParentIds: effectiveRootParentIds,
    syncAll: effectiveSyncAll
  };
  /** 只有已落库父目录可用于实际写入，父层失败时保持跳过语义。 */
  const resolveParentId = (record: ApiFileRecord): Types.ObjectId | null | undefined => {
    const { parentId } = resolveApiFileRecordParent({ record, ...parentOptions });
    return parentId === undefined ? undefined : parentId ? new Types.ObjectId(parentId) : null;
  };
  const buildCorrections = (): BulkMoveCollectionParentItem[] =>
    buildApiFileParentUpdates({
      records,
      collections: existCollections,
      ...parentOptions
    }).map((item) => ({
      ...item,
      datasetId: String(dataset._id),
      newParentId: item.newParentId ? new Types.ObjectId(item.newParentId) : null
    }));

  // 写入前生成完整计划：鉴权失败或最终父级成环时，不能留下任何目录骨架。
  const plannedIdMap = new Map([
    ...idMap,
    ...folderPlan.map(({ record, id }) => [record.apiFileId, String(id)] as const)
  ]);
  const plannedMoves = buildApiFileParentUpdates({
    records,
    collections: existCollections,
    idMap: plannedIdMap,
    targetParentId,
    rootParentIds: effectiveRootParentIds,
    syncAll: effectiveSyncAll
  });
  const newFolders = folderPlan.map(({ record, id }) => ({
    id: String(id),
    parentId:
      resolveApiFileRecordParent({
        record,
        idMap: plannedIdMap,
        targetParentId,
        rootParentIds: effectiveRootParentIds,
        syncAll: effectiveSyncAll
      }).parentId ?? null
  }));
  const newFolderParents = new Map(newFolders.map((folder) => [folder.id, folder.parentId]));
  const existingParents = new Map(
    existCollections.map((item) => [String(item._id), item.parentId ? String(item.parentId) : null])
  );
  await assertParentPlanAcyclic({
    changes: [
      ...newFolders,
      ...plannedMoves.map((item) => ({ id: item._id, parentId: item.newParentId }))
    ],
    loadParents: async (ids) =>
      ids.flatMap((id) =>
        existingParents.has(id) ? [{ id, parentId: existingParents.get(id)! }] : []
      )
  });
  const creationParentIds = new Set<string | null>();
  for (const record of records) {
    if (existByApiFileId.has(record.apiFileId)) continue;
    let parentId = resolveApiFileRecordParent({
      record,
      idMap: plannedIdMap,
      targetParentId,
      rootParentIds: effectiveRootParentIds,
      syncAll: effectiveSyncAll
    }).parentId;
    if (parentId === undefined) continue;
    // 新目录归当前调用者所有，其创建授权来自最近已有父级，不能查询尚未落库的目录。
    while (parentId && newFolderParents.has(parentId))
      parentId = newFolderParents.get(parentId) ?? null;
    creationParentIds.add(parentId);
  }
  const hasPausedApiFolder = localCollections.some(
    (item) =>
      item.type === DatasetCollectionTypeEnum.folder &&
      Boolean(item.apiFileId) &&
      item.syncChildren === false
  );
  // 整库同步开启与信息页共用同一口径：需要知识库 Manage 权限，且事务内原子开启 syncAll 并恢复全部暂停目录。
  const shouldApplyDatasetSyncAll = effectiveSyncAll && (!dataset.syncAll || hasPausedApiFolder);
  const reEnableSyncFolderIds = effectiveSyncAll
    ? []
    : [
        ...new Set(
          records.flatMap((record) => {
            if (record.type !== 'folder' || record.syncChildren === false) return [];
            const existing = existByApiFileId.get(record.apiFileId);
            return existing?.type === DatasetCollectionTypeEnum.folder &&
              existing.syncChildren === false
              ? [String(existing._id)]
              : [];
          })
        )
      ];

  await authorizeChanges?.({
    creationParentIds: [...creationParentIds],
    newFolderIds: new Set(newFolderParents.keys()),
    moves: plannedMoves,
    ...(legacyPlan.permissionSources.size
      ? { permissionSourceIds: [...new Set(legacyPlan.permissionSources.values())] }
      : {}),
    ...(reEnableSyncFolderIds.length ? { reEnableSyncFolderIds } : {}),
    ...(shouldApplyDatasetSyncAll ? { enableDatasetSyncAll: true } : {})
  });

  await applyLegacyApiFileFolders({
    teamId,
    datasetId: String(dataset._id),
    migrations: legacyPlan.migrations
  });

  let successCount = 0;
  let failedCount = 0;

  // 4. 与同步共用按层补建流程；仅成功提交的目录会进入 idMap。
  const folderResult = await createApiFileFolders({
    folders: folderPlan,
    ...parentOptions,
    inheritPermissionOf,
    insertFolders: (docs) =>
      bulkInsertFolderCollections({ teamId, tmbId, datasetId: String(dataset._id), docs })
  });
  successCount += folderResult.createdIds.length;
  failedCount += folderResult.failedIds.length + folderResult.skippedIds.length;

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
              permissionSourceCollectionId: legacyPlan.permissionSources.get(record.apiFileId),
              metadata: { relatedImgId: record.apiFileId }
            })),
            createCollectionParams: {
              ...body,
              teamId,
              tmbId,
              type: DatasetCollectionTypeEnum.apiFile,
              customPdfParse
            },
            modelAuthContext,
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

  // 7. 导入完成后落盘同步范围状态：
  //    - 整库开启：与设置路由共用 applyApiDatasetSyncAll，在同一事务内原子写入 syncAll=true 并恢复全部暂停目录；
  //    - 局部导入：仅恢复本次显式勾选覆盖到的暂停目录。
  if (shouldApplyDatasetSyncAll && failedCount === 0) {
    await applyApiDatasetSyncAll({
      teamId,
      datasetId: dataset._id
    });
  } else if (reEnableSyncFolderIds.length > 0) {
    await MongoDatasetCollection.updateMany(
      {
        _id: { $in: reEnableSyncFolderIds },
        teamId,
        datasetId: dataset._id,
        type: DatasetCollectionTypeEnum.folder
      },
      { $set: { syncChildren: true } }
    );
  }

  logger.info('Create api file collection completed', {
    teamId,
    datasetId: String(dataset._id),
    nodeCount: nodes.length,
    folderCount: records.filter((record) => record.type === 'folder').length,
    fileCount: fileRecords.length,
    successCount,
    failedCount
  });

  return { successCount, failedCount };
};
