import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { planApiFileFolders } from './folder';
import type { ApiFileRecord } from './tree';
import {
  buildApiFileParentUpdates,
  resolveApiFileRecordParent,
  type ApiFileLocalCollection
} from './utils';

/**
 * 基于完整远端树和本地快照计算结构差量，不读写数据库。
 * 预分配目录 ID 用于验证最终树；idMap 只包含已存在节点，执行阶段提交成功后才能补入新目录。
 * 旧文件名单与新增文件分离，避免新增解析任务再次进入本轮内容同步。
 */
export const buildApiFileSyncPlan = <T extends ApiFileLocalCollection & { name: string }>({
  records,
  collections
}: {
  records: ApiFileRecord[];
  collections: T[];
}) => {
  const root = collections.find((item) => item.apiFileId === RootCollectionId);
  const rootCollectionId = root ? String(root._id) : undefined;
  const existingByApiId = new Map(
    collections
      .filter((item) => item.apiFileId && item.apiFileId !== RootCollectionId)
      .map((item) => [item.apiFileId!, item])
  );
  const idMap = new Map(
    [...existingByApiId].map(([apiFileId, item]) => [apiFileId, String(item._id)])
  );
  const folders = planApiFileFolders({ records, idMap });
  const plannedIdMap = new Map(idMap);
  for (const { record, id } of folders) plannedIdMap.set(record.apiFileId, String(id));

  const missingFiles: ApiFileRecord[] = [];
  const existingFileIds: string[] = [];
  const renames: Array<{ collectionId: string; apiFileId: string; name: string }> = [];
  const remoteIds = new Set<string>();
  let existingCount = 0;
  for (const record of records) {
    remoteIds.add(record.apiFileId);
    const existing = existingByApiId.get(record.apiFileId);
    if (!existing) {
      if (record.type === 'file') missingFiles.push(record);
      continue;
    }
    const expectedType =
      record.type === 'folder'
        ? DatasetCollectionTypeEnum.folder
        : DatasetCollectionTypeEnum.apiFile;
    if (existing.type !== expectedType) {
      throw new Error(
        `Api file record type conflicts with existing collection: apiFileId=${record.apiFileId}, expected=${expectedType}, actual=${existing.type}`
      );
    }
    existingCount++;
    if (record.type === 'file') existingFileIds.push(record.apiFileId);
    if (existing.name !== record.name)
      renames.push({
        collectionId: String(existing._id),
        apiFileId: record.apiFileId,
        name: record.name
      });
  }

  const parentUpdates = buildApiFileParentUpdates({
    records,
    collections,
    idMap: plannedIdMap,
    rootCollectionId
  });
  const parentChanges = [
    ...folders.map(({ record, id }) => {
      const { parentId } = resolveApiFileRecordParent({
        record,
        idMap: plannedIdMap,
        rootCollectionId
      });
      if (parentId === undefined) throw new Error(`Missing API file parent: ${record.apiFileId}`);
      return { id: String(id), parentId };
    }),
    ...parentUpdates.map((item) => ({ id: item._id, parentId: item.newParentId }))
  ];
  const deleteCandidates = collections.filter(
    (item) =>
      item.apiFileId && item.apiFileId !== RootCollectionId && !remoteIds.has(item.apiFileId)
  );
  return {
    idMap,
    rootCollectionId,
    folders,
    missingFiles,
    existingFileIds,
    existingCount,
    renames,
    parentUpdates,
    parentChanges,
    deleteCandidates
  };
};

/**
 * 用结构操作后的实际快照筛选删除候选，保留所有存活节点仍引用的祖先。
 * 部分目录/移动失败或用户目录仍挂在旧树时不能删掉其父级；迭代遍历也能安全处理历史环。
 * ID 和远端身份必须同时匹配，避免沿用旧快照删除已经替换的记录。
 */
export const selectApiFileSyncDeletes = <T extends ApiFileLocalCollection>({
  candidates,
  collections
}: {
  candidates: ApiFileLocalCollection[];
  collections: T[];
}): T[] => {
  const candidateById = new Map(candidates.map((item) => [String(item._id), item.apiFileId]));
  const localById = new Map(collections.map((item) => [String(item._id), item]));
  const pendingDelete = new Set(
    collections
      .filter(
        (item) =>
          candidateById.has(String(item._id)) &&
          candidateById.get(String(item._id)) === item.apiFileId
      )
      .map((item) => String(item._id))
  );
  const visited = new Set<string>();
  for (const item of collections) {
    if (pendingDelete.has(String(item._id))) continue;
    let parentId = item.parentId ? String(item.parentId) : null;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      pendingDelete.delete(parentId);
      const parent = localById.get(parentId);
      parentId = parent?.parentId ? String(parent.parentId) : null;
    }
  }
  return collections.filter((item) => pendingDelete.has(String(item._id)));
};
