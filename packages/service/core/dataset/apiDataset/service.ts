import { randomUUID } from 'node:crypto';
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
  type BulkMoveCollectionParentItem
} from '../collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '../collection/schema';
import { getApiDatasetRequest } from './index';
import { buildApiFileRecords, buildApiFileTree, toApiFileDirId, type ApiFileRecord } from './tree';
import {
  buildApiFileParentUpdates,
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
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import { lockDatasetCollectionPermissionState } from '../../../support/permission/collection/datasetSwitch';
import { getLogger, LogCategories } from '../../../common/logger';
import { startDatasetImportAudit } from '../audit';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { TeamAuditDetail } from '@fastgpt/global/support/user/audit/type';
import { refreshTrainingAuditTask } from '../training/audit';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import type { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';

const logger = getLogger(LogCategories.MODULE.DATASET);

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
  apiFiles,
  authorizeChanges,
  customPdfParse,
  teamId,
  tmbId,
  dataset,
  // 请求体 parentId 被忽略（V2 本地树镜像 server 树），仅显式传入的 targetParentId 生效（供 V1 路由使用）
  parentId: _requestParentId,
  targetParentId,
  // 内部调用的权限标记单独取出：它只作用于显式选中的节点，混进 ...body 会落到整棵展开树
  inheritPermission: requestInheritPermission,
  auditTaskId: externalAuditTaskId,
  ...body
}: CreateApiCollectionV2BodyType &
  Pick<ApiCreateDatasetCollectionParams, 'inheritPermission'> & {
    /** HTTP 调用方必须传入实际变更计划鉴权；worker 等可信内部调用不经过用户鉴权。 */
    authorizeChanges?: (changes: ApiFileImportChanges) => Promise<void>;
    teamId: string;
    tmbId: string;
    /** 仅供 V1 内部调用指定落位，V2 HTTP 入参不开放此字段。 */
    targetParentId?: CreateApiCollectionV2BodyType['parentId'];
    /** 可信内部调用可复用上层 audit task；HTTP 导入未传时由本服务创建。 */
    auditTaskId?: string;
    dataset: DatasetSchemaType & {
      permission: DatasetPermission;
    };
  }): Promise<CreateApiCollectionV2ResponseType> => {
  const auditTaskId = externalAuditTaskId ?? randomUUID();
  const auditDetails: TeamAuditDetail[] = [];
  const startId =
    dataset.apiDatasetServer?.apiServer?.basePath ||
    dataset.apiDatasetServer?.yuqueServer?.basePath ||
    dataset.apiDatasetServer?.feishuServer?.folderToken ||
    dataset.apiDatasetServer?.dingtalkServer?.rootNodeId;

  const request = await getApiDatasetRequest(dataset.apiDatasetServer);

  // 1. 本地快照同时用于幂等匹配、旧目录识别与后续移动计划。
  const localCollections = await MongoDatasetCollection.find(
    { teamId, datasetId: dataset._id },
    'name _id apiFileId apiFileParentId parentId type inheritPermission metadata'
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
  // V2 根信息来自客户端。兼容旧目录前使用真实详情更新类型和 hasChild，防止旧页面信息漏掉子树。
  const seeds = await (async () => {
    if (!usesDingtalkDataset(dataset.apiDatasetServer)) return apiFiles;
    const verified: typeof apiFiles = [];
    const details = new Map<string, ReturnType<typeof request.getFileDetail>>();
    for (const item of apiFiles) {
      if (
        item.id === RootCollectionId ||
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

  // 2. 拉 server 树（父先子后）。拉取失败直接抛出，本轮不写任何数据
  const nodes = await buildApiFileTree({
    request,
    seeds: seeds.map((item) => ({
      ...item,
      // 根哨兵不是真实 server 节点，展开子级要用知识库根
      ...(item.id === RootCollectionId ? { listId: startId } : {})
    }))
  });

  // 2b. 摊平成待落库记录：folder 只出目录记录；带子文档的 file 出「同名目录 + 正文」两条，
  //     于是子节点始终挂在一条真实的目录上，不会再出现「父是 file 导致 parentId 无解」
  const remoteRecords = buildApiFileRecords(nodes);

  // 2c. 请求级 inheritPermission 只作用于**显式选中的节点**：它们的后代保持继承态，权限跟随
  //     选中的祖先（整库导入时只有根哨兵独立，全库继承它）。
  //     否则 4w 节点各自落独立态，给某个目录授权不会传给其子目录。
  //     #dir 是选中文件的同名目录，同属该节点，用与建树同一个函数派生，避免后缀口径漂移
  const selectedDirIds = new Set(
    seeds.flatMap((item) => [item.id, toApiFileDirId(item.id, item.type)])
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

  const parentOptions = {
    idMap,
    targetParentId,
    rootParentIds: legacyPlan.rootParentIds
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
    rootParentIds: legacyPlan.rootParentIds
  });
  const newFolders = folderPlan.map(({ record, id }) => ({
    id: String(id),
    parentId:
      resolveApiFileRecordParent({
        record,
        idMap: plannedIdMap,
        targetParentId,
        rootParentIds: legacyPlan.rootParentIds
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
      rootParentIds: legacyPlan.rootParentIds
    }).parentId;
    if (parentId === undefined) continue;
    // 新目录归当前调用者所有，其创建授权来自最近已有父级，不能查询尚未落库的目录。
    while (parentId && newFolderParents.has(parentId))
      parentId = newFolderParents.get(parentId) ?? null;
    creationParentIds.add(parentId);
  }
  await authorizeChanges?.({
    creationParentIds: [...creationParentIds],
    newFolderIds: new Set(newFolderParents.keys()),
    moves: plannedMoves,
    ...(legacyPlan.permissionSources.size
      ? { permissionSourceIds: [...new Set(legacyPlan.permissionSources.values())] }
      : {})
  });

  let successCount = 0;
  let failedCount = 0;
  const fileRecords = records.filter((record) => record.type === 'file');
  const initialAuditDetails: TeamAuditDetail[] = records.map((record) => ({
    resourceName: record.name,
    resourceType: record.type === 'folder' ? 'folder' : 'collection',
    sourceType: 'api',
    sourceName: record.name,
    action: 'import',
    result: 'processing'
  }));
  // 必须先落 processing 主审计，再执行任何会创建训练任务的事务；提交后的明细和 sourceFinished
  // 通过 CAS 回填，进程在提交与收口之间退出时仍保留可供补偿扫描的审计锚点。
  const importAudit = await startDatasetImportAudit({
    taskId: auditTaskId,
    teamId,
    tmbId,
    datasetId: String(dataset._id),
    datasetName: dataset.name,
    collectionName: 'api_files',
    sourceType: 'api',
    insertLen: String(records.length),
    details: initialAuditDetails
  });

  await applyLegacyApiFileFolders({
    teamId,
    datasetId: String(dataset._id),
    migrations: legacyPlan.migrations
  });

  /**
   * 写入 API 文件导入的源阶段快照；事务失败也必须留下 terminal failed 事件，不能让审计只依赖训练队列。
   * 预先创建的主审计通过 CAS 更新，旁路失败不能反向覆盖真实业务结果。
   */
  const writeImportAudit = async ({
    terminal = false,
    failureReason
  }: {
    terminal?: boolean;
    failureReason?: string;
  } = {}) => {
    // 审计总量按本轮完整 records 统计；幂等命中的节点视为本次操作成功。
    // API 返回的 successCount 仍只统计实际新建节点，保持创建接口的幂等语义不变。
    const auditSuccessCount = Math.max(records.length - failedCount, 0);
    const result = terminal
      ? 'failed'
      : auditSuccessCount === 0 && failedCount > 0
        ? 'failed'
        : failedCount > 0
          ? 'processing'
          : auditSuccessCount > 0
            ? 'processing'
            : 'success';

    await importAudit.finish({
      result,
      // insertLen、successCount、failedCount 统一覆盖 folder 与 file，且满足总量 = 成功 + 失败。
      insertLen: String(records.length),
      successCount: String(auditSuccessCount),
      failedCount: String(failedCount),
      sourceFailedCount: String(failedCount),
      failureReason,
      details: auditDetails
    });
  };

  /** 追加一条源阶段失败明细；数量字段负责完整统计，details 会由审计工具按上限截断。 */
  const addSourceFailureDetail = ({
    resourceId,
    resourceName,
    resourceType = 'collection',
    action = 'import'
  }: {
    resourceId: string;
    resourceName: string;
    resourceType?: string;
    action?: string;
  }) => {
    auditDetails.push({
      resourceId,
      resourceName,
      resourceType,
      sourceType: 'api',
      sourceName: resourceName,
      action,
      result: 'failed'
    });
  };

  // 4. 与同步共用按层补建流程；仅成功提交的目录会进入 idMap。
  const folderResult = await createApiFileFolders({
    folders: folderPlan,
    ...parentOptions,
    inheritPermissionOf,
    insertFolders: (docs) =>
      bulkInsertFolderCollections({ teamId, tmbId, datasetId: String(dataset._id), docs })
  });
  const folderFailedIds = new Set([...folderResult.failedIds, ...folderResult.skippedIds]);
  const createdFolderIds = new Set(folderResult.createdIds);
  successCount += folderResult.createdIds.length;
  failedCount += folderFailedIds.size;
  for (const { record, id } of folderPlan) {
    if (createdFolderIds.has(record.apiFileId)) {
      auditDetails.push({
        resourceId: String(id),
        resourceName: record.name,
        resourceType: 'folder',
        sourceType: 'api',
        sourceName: record.name,
        action: 'import',
        result: 'success'
      });
    } else if (folderFailedIds.has(record.apiFileId)) {
      addSourceFailureDetail({
        resourceId: String(id),
        resourceName: record.name,
        resourceType: 'folder'
      });
    }
  }

  // 5. 校正已存在节点的层级。
  // 必须在上面目录逐层落库的循环之后调用：idMap 在该循环里才补入新目录的 _id。
  // 取舍：以 server 层级为准，挂在自建（无 apiFileId）文件夹下的节点会被重挂到 server 真实父级。
  // 若产品改为「用户显式摆放优先」，在此处跳过 parentId 指向自建文件夹的节点即可
  const corrections = buildCorrections();

  if (corrections.length > 0) {
    const collectionNameById = new Map(
      localCollections.map((collection) => [String(collection._id), collection.name])
    );
    /** 将显式失败与 matchedCount 未命中统一计入源阶段失败，并保留逐项明细。 */
    const recordCorrectionFailures = (input: {
      failedIds?: string[];
      successIds?: string[];
      matchedCount?: number;
      allFailed?: boolean;
    }) => {
      const correctionIds = new Set(corrections.map((item) => item._id));
      const failedIds = input.allFailed
        ? correctionIds
        : new Set((input.failedIds ?? []).filter((id) => correctionIds.has(id)));
      const unmatchedCount = Math.max(
        0,
        corrections.length - (input.matchedCount ?? corrections.length)
      );
      const expectedFailedCount = input.allFailed
        ? corrections.length
        : Math.min(corrections.length, failedIds.size + unmatchedCount);
      const successIds = new Set(input.successIds ?? []);

      // 某些 Mongo 写入异常只返回 matchedCount，无法定位具体未命中的行；用未报告成功的条目补齐数量。
      for (const item of corrections) {
        if (failedIds.size >= expectedFailedCount) break;
        if (!successIds.has(item._id)) failedIds.add(item._id);
      }
      for (const item of corrections) {
        if (failedIds.size >= expectedFailedCount) break;
        failedIds.add(item._id);
      }

      const failedItems = corrections.filter((item) => failedIds.has(item._id));
      failedCount += failedItems.length;
      failedItems.forEach((item) => {
        addSourceFailureDetail({
          resourceId: item._id,
          resourceName: collectionNameById.get(item._id) ?? item._id,
          action: 'update'
        });
      });
      return failedItems;
    };

    try {
      // ACL 迁移必须先于 parentId 写入（要读变更前的父级），两者同一事务
      const correctionResult = await mongoSessionRun((session) =>
        bulkMoveCollectionsParent({ teamId, items: corrections, session })
      );
      const failedItems = recordCorrectionFailures(correctionResult);

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
          matchedCount: correctionResult.matchedCount,
          failedCount: failedItems.length
        });
      }
    } catch (error) {
      // bulkMoveCollectionsParent 的事务失败会整体回滚；后续 file 写入也不会执行，必须把这些文件补记为失败。
      recordCorrectionFailures({ allFailed: true });
      const correctedFileIds = new Set(
        corrections.flatMap((correction) => {
          const collection = existCollections.find((item) => String(item._id) === correction._id);
          return collection?.apiFileId ? [collection.apiFileId] : [];
        })
      );
      for (const record of fileRecords) {
        if (correctedFileIds.has(record.apiFileId)) continue;
        failedCount++;
        addSourceFailureDetail({
          resourceId: record.apiFileId,
          resourceName: record.name
        });
      }
      await writeImportAudit({ terminal: true, failureReason: getErrText(error) });
      logger.warn('Create api file collection parent correction transaction failed', {
        teamId,
        datasetId: String(dataset._id),
        failedCount: corrections.length,
        error
      });
      throw error;
    }
  }

  // 6. file 单事务整批写入：全部落库或全部回滚，不做部分成功。
  //    目标环境已用 10 万条完整数据验证该路径；保持单事务是明确的原子性取舍，事务生命周期配置
  //    必须与压测环境一致。maxCommitTimeMS 只放宽提交阶段，不替代服务端事务生命周期配置。
  const writable: Array<{ record: ApiFileRecord; parentId: Types.ObjectId | null }> = [];

  for (const record of fileRecords) {
    // 已落库的 file 只参与上面的层级校正，不重复创建
    if (existByApiFileId.has(record.apiFileId)) continue;

    const parentId = resolveParentId(record);
    // 未命中不等于回退：只可能是祖先目录本轮写入失败，整棵跳过，重新导入即可幂等补齐。
    // null 是合法值（顶层记录 → 落在知识库根）
    if (parentId === undefined) {
      failedCount++;
      addSourceFailureDetail({
        resourceId: record.apiFileId,
        resourceName: record.name
      });
      continue;
    }
    writable.push({ record, parentId });
  }

  if (writable.length > 0) {
    try {
      const created = await mongoSessionRun(
        async (session) => {
          return createApiFileCollectionsBatch({
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
            auditTaskId,
            session
          });
        },
        // 整批（4w 量级）一个事务，默认 60s 提交上限不够
        { maxCommitTimeMS: API_FILE_FILE_COMMIT_TIMEOUT_MS }
      );
      const createdCollectionIds =
        created.collectionIds.length > 0
          ? created.collectionIds
          : writable.map(({ record }) => record.apiFileId);
      successCount += createdCollectionIds.length;
      writable.forEach(({ record }, index) => {
        auditDetails.push({
          resourceId: createdCollectionIds[index] ?? record.apiFileId,
          resourceName: record.name,
          resourceType: 'collection',
          sourceType: 'api',
          sourceName: record.name,
          action: 'import',
          result: 'processing'
        });
      });
    } catch (error) {
      // 事务已整体回滚，无部分成功（含配额不足、模型解析失败、事务超时）：整批计入失败。
      // 必须抛出让调用方感知，同时先落一条 terminal failed 审计，不能只依赖训练队列推断结果。
      failedCount += writable.length;
      writable.forEach(({ record }) => {
        addSourceFailureDetail({
          resourceId: record.apiFileId,
          resourceName: record.name
        });
      });
      await writeImportAudit({ terminal: true, failureReason: getErrText(error) });
      logger.warn('Create api file collection batch failed', {
        teamId,
        datasetId: String(dataset._id),
        batchSize: writable.length,
        succeededCount: successCount,
        failedCount: writable.length,
        error
      });
      throw error;
    }
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

  await writeImportAudit();
  await refreshTrainingAuditTask(auditTaskId);

  return { successCount, failedCount };
};
