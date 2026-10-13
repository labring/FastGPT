import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { toApiFileDirId, type ApiFileRecord } from './tree';

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

/**
 * 创建和同步共用的父级解析。导入根可保留已有位置，正文进入派生目录属于真实移动；
 * 远端父 ID 为空只意味着应清除字段，不能据此跳过本地父级校正。
 */
export const resolveApiFileRecordParent = ({
  record,
  idMap,
  targetParentId,
  rootCollectionId
}: {
  record: ApiFileRecord;
  idMap: Map<string, string>;
  targetParentId?: string | null;
  rootCollectionId?: string;
}) => ({
  parentId:
    record.parentDirId === null
      ? (targetParentId ?? rootCollectionId ?? null)
      : idMap.get(record.parentDirId),
  apiFileParentId: record.apiFileParentId ?? (rootCollectionId ? RootCollectionId : null),
  preserveExistingPlacement: record.parentDirId === null && !targetParentId && !rootCollectionId
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
  return records.flatMap((record) => {
    const existing = existingById.get(record.apiFileId);
    if (!existing) return [];
    const { parentId, apiFileParentId, preserveExistingPlacement } = resolveApiFileRecordParent({
      record,
      ...parentOptions
    });
    if (parentId === undefined || preserveExistingPlacement) return [];
    const oldParentId = existing.parentId ? String(existing.parentId) : null;
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
