import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { toApiFileDirId, type ApiFileRecord } from './tree';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';

/** 本地 collection 的身份与父级快照；兼容 lean 字符串和 Mongoose ObjectId。 */
export type ApiFileLocalCollection = {
  _id: unknown;
  apiFileId?: string;
  apiFileParentId?: string | null;
  parentId?: unknown;
  type: DatasetCollectionTypeEnum;
  inheritPermission?: boolean;
  metadata?: Record<string, unknown>;
};

export type ApiFileParentUpdate = {
  _id: string;
  type: DatasetCollectionTypeEnum;
  inheritPermission?: boolean;
  oldParentId: string | null;
  newParentId: string | null;
  apiFileParentId: string | null;
};

export type LegacyApiFileFolderMigration = {
  collectionId: string;
  sourceId: string;
  directoryId: string;
  oldParentId: string | null;
  inheritPermission?: boolean;
};

/** 沿用请求 factory 的配置优先级，旧目录正文兼容只适用于实际启用的钉钉 Provider。 */
export const usesDingtalkDataset = (apiDatasetServer?: ApiDatasetServerType) => {
  const { apiServer, yuqueServer, feishuServer, dingtalkServer } = apiDatasetServer ?? {};
  return Boolean(dingtalkServer && !apiServer && !yuqueServer && !feishuServer);
};

/**
 * 兼容旧钉钉把带子文档的正文存成目录的记录；只有远端已确认正文、且本地无新格式来源标记时转换。
 * 原目录改用派生身份，保留本地 ID、子树和 ACL。已变成叶子的正文复用原位置及权限，临时目录
 * 参与本轮移动计划但可在正文创建成功后删除；失败后的下一轮可从来源标记继续，不依赖内存状态。
 */
export const planLegacyApiFileFolders = <T extends ApiFileLocalCollection>({
  records,
  collections,
  apiDatasetServer
}: {
  records: ApiFileRecord[];
  collections: T[];
  apiDatasetServer?: ApiDatasetServerType;
}) => {
  const migrations: LegacyApiFileFolderMigration[] = [];
  const permissionSources = new Map<string, string>();
  const rootParentIds = new Map<string, string | null>();
  const transientFolderIds = new Set<string>();
  const plannedRecords = [...records];
  if (!usesDingtalkDataset(apiDatasetServer)) {
    return {
      records,
      collections,
      migrations,
      permissionSources,
      rootParentIds,
      transientFolderIds
    };
  }

  const byApiId = new Map(collections.map((item) => [item.apiFileId, item]));
  const remoteSourceIds = new Set(records.map((item) => item.sourceId));
  for (const record of records) {
    const existing = byApiId.get(record.apiFileId);
    if (
      record.type !== 'file' ||
      existing?.type !== DatasetCollectionTypeEnum.folder ||
      existing.metadata?.apiFileSourceId !== undefined
    )
      continue;
    const directoryId = toApiFileDirId(record.sourceId, 'file');
    if (byApiId.has(directoryId) || remoteSourceIds.has(directoryId)) {
      throw new Error(`Legacy API file directory identity conflicts: ${directoryId}`);
    }
    migrations.push({
      collectionId: String(existing._id),
      sourceId: record.sourceId,
      directoryId,
      oldParentId: existing.parentId ? String(existing.parentId) : null,
      inheritPermission: existing.inheritPermission
    });
  }
  const migrationById = new Map(migrations.map((item) => [item.collectionId, item]));
  const normalizedCollections = collections.map((item) => {
    const migration = migrationById.get(String(item._id));
    return migration
      ? {
          ...item,
          apiFileId: migration.directoryId,
          metadata: {
            ...item.metadata,
            apiFileSourceId: migration.sourceId,
            apiFileLegacyDocument: true
          }
        }
      : item;
  });
  const normalizedByApiId = new Map(normalizedCollections.map((item) => [item.apiFileId, item]));
  const recordIds = new Set(records.map((item) => item.apiFileId));
  for (const record of records) {
    if (record.type !== 'file' || normalizedByApiId.has(record.apiFileId)) continue;
    const directoryId = toApiFileDirId(record.sourceId, 'file');
    const directory = normalizedByApiId.get(directoryId);
    if (
      directory?.type !== DatasetCollectionTypeEnum.folder ||
      directory.metadata?.apiFileLegacyDocument !== true ||
      directory.metadata.apiFileSourceId !== record.sourceId
    )
      continue;
    permissionSources.set(record.apiFileId, String(directory._id));
    if (!recordIds.has(directoryId)) {
      plannedRecords.push({ ...record, apiFileId: directoryId, type: 'folder' });
      transientFolderIds.add(directoryId);
      rootParentIds.set(record.sourceId, directory.parentId ? String(directory.parentId) : null);
    }
  }
  return {
    records: plannedRecords,
    collections: normalizedCollections,
    migrations,
    permissionSources,
    rootParentIds,
    transientFolderIds
  };
};

/**
 * 创建和同步共用的父级解析。导入根可保留已有位置，正文进入派生目录属于真实移动；
 * 远端父 ID 为空只意味着应清除字段，不能据此跳过本地父级校正。
 */
export const resolveApiFileRecordParent = ({
  record,
  idMap,
  targetParentId,
  rootCollectionId,
  rootParentIds
}: {
  record: ApiFileRecord;
  idMap: Map<string, string>;
  targetParentId?: string | null;
  rootCollectionId?: string;
  /** 旧正文转换为叶子时，首次创建沿用其原目录位置；显式目标和整库哨兵仍优先。 */
  rootParentIds?: Map<string, string | null>;
}) => ({
  parentId:
    record.parentDirId === null
      ? targetParentId !== undefined
        ? targetParentId
        : (rootCollectionId ?? rootParentIds?.get(record.sourceId) ?? null)
      : idMap.get(record.parentDirId),
  apiFileParentId: record.apiFileParentId ?? (rootCollectionId ? RootCollectionId : null),
  preserveExistingPlacement:
    record.parentDirId === null && targetParentId === undefined && !rootCollectionId
});

/** 从远端记录和本地快照生成幂等移动计划；缺失父目录时保留原位，根字段通过 null 表达 unset。 */
export const buildApiFileParentUpdates = ({
  records,
  collections,
  ...parentOptions
}: {
  records: ApiFileRecord[];
  collections: ApiFileLocalCollection[];
} & Omit<Parameters<typeof resolveApiFileRecordParent>[0], 'record'>): ApiFileParentUpdate[] => {
  const existingById = new Map(collections.map((item) => [item.apiFileId, item]));
  const existingByLocalId = new Map(collections.map((item) => [String(item._id), item]));
  const remoteIds = new Set(records.map((item) => item.apiFileId));
  return records.flatMap((record) => {
    const existing = existingById.get(record.apiFileId);
    if (!existing) return [];
    const {
      parentId: resolvedParentId,
      apiFileParentId,
      preserveExistingPlacement
    } = resolveApiFileRecordParent({
      record,
      ...parentOptions
    });
    const oldParentId = existing.parentId ? String(existing.parentId) : null;
    const parentId = (() => {
      if (!preserveExistingPlacement) return resolvedParentId;
      // 局部导入根从“目录＋正文”变回叶子文件时，正文应回到派生目录原来的位置。
      // 普通用户目录仍保留；明确来源或历史同名目录内的正文挂载关系才作为派生目录证据。
      const previousDirectory = oldParentId ? existingByLocalId.get(oldParentId) : undefined;
      if (
        record.type !== 'file' ||
        previousDirectory?.type !== DatasetCollectionTypeEnum.folder ||
        previousDirectory.apiFileId !== toApiFileDirId(record.sourceId, 'file') ||
        remoteIds.has(previousDirectory.apiFileId) ||
        (previousDirectory.metadata?.apiFileSourceId !== undefined &&
          previousDirectory.metadata.apiFileSourceId !== record.sourceId)
      )
        return undefined;
      return previousDirectory.parentId ? String(previousDirectory.parentId) : null;
    })();
    if (parentId === undefined) return [];
    if (oldParentId === parentId && (existing.apiFileParentId ?? null) === apiFileParentId)
      return [];
    return [
      {
        _id: String(existing._id),
        type: existing.type,
        inheritPermission: existing.inheritPermission,
        oldParentId,
        newParentId: parentId,
        apiFileParentId
      }
    ];
  });
};

/**
 * 同步只查询真实远端 ID。新派生目录保存 sourceId，正文尚未落库时也能恢复同步；
 * 历史目录仅在本地挂载关系能证明来源时兼容，不盲目裁剪 provider ID 的后缀。
 */
export const getApiFileSyncRootIds = (collections: ApiFileLocalCollection[]): string[] => {
  const localByApiId = new Map(
    collections.filter((item) => item.apiFileId).map((item) => [item.apiFileId!, item])
  );
  const remoteParentsByLocalParent = new Map<string, Set<string>>();
  for (const item of collections) {
    if (!item.parentId || !item.apiFileParentId) continue;
    const parentId = String(item.parentId);
    const remoteParents = remoteParentsByLocalParent.get(parentId) ?? new Set<string>();
    remoteParents.add(item.apiFileParentId);
    remoteParentsByLocalParent.set(parentId, remoteParents);
  }
  const legacySources = new Map<string, string>();
  for (const item of collections) {
    if (item.type !== DatasetCollectionTypeEnum.apiFile || !item.apiFileId) continue;
    const dirId = toApiFileDirId(item.apiFileId, 'file');
    const directory = localByApiId.get(dirId);
    if (directory?.type !== DatasetCollectionTypeEnum.folder) continue;
    // 同名后缀本身不是证据：真实 provider 允许 doc 和 doc#dir 同时存在。
    // 只有正文挂在自己的目录内，或子文档的远端父级与本地目录对应，才按历史派生记录兼容。
    const isDerived =
      (String(item.parentId ?? '') === String(directory._id) && item.apiFileParentId !== dirId) ||
      remoteParentsByLocalParent.get(String(directory._id))?.has(item.apiFileId);
    if (isDerived) legacySources.set(dirId, item.apiFileId);
  }
  const sourceIdOf = (item: ApiFileLocalCollection) => {
    if (!item.apiFileId) return undefined;
    if (item.type !== DatasetCollectionTypeEnum.folder) return item.apiFileId;
    const sourceId = item.metadata?.apiFileSourceId;
    return typeof sourceId === 'string' && sourceId
      ? sourceId
      : (legacySources.get(item.apiFileId ?? '') ?? item.apiFileId);
  };
  const sourceIds = new Set(collections.map(sourceIdOf).filter(Boolean));
  return [
    ...new Set(
      collections.flatMap((item) => {
        const sourceId = sourceIdOf(item);
        return sourceId &&
          sourceId !== RootCollectionId &&
          (!item.apiFileParentId || !sourceIds.has(item.apiFileParentId))
          ? [sourceId]
          : [];
      })
    )
  ];
};
