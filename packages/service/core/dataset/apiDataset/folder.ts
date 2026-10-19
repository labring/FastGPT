import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '../../../common/mongo';
import type {
  BulkInsertCollectionDoc,
  bulkInsertFolderCollections
} from '../collection/controller';
import type { ApiFileRecord } from './tree';
import { resolveApiFileRecordParent } from './utils';

/** 预分配缺失目录 ID，供写入前的树校验和鉴权使用；不把未提交 ID 放入实际父级映射。 */
export const planApiFileFolders = ({
  records,
  idMap
}: {
  records: ApiFileRecord[];
  idMap: Map<string, string>;
}) =>
  records
    .filter((record) => record.type === 'folder' && !idMap.has(record.apiFileId))
    .map((record) => ({ record, id: new Types.ObjectId() }));

/**
 * 导入和同步共用目录补建：只用已提交的父级按层写入，成功后再更新 idMap。
 * 预分配 ID 不代表创建成功；父层失败时跳过其后代，不回退到根。返回失败与跳过供调用方统计。
 * 写入能力由调用方注入，权限继承及同步根哨兵作为明确的上下文传入。
 */
export const createApiFileFolders = async ({
  folders,
  idMap,
  targetParentId,
  rootCollectionId,
  inheritPermissionOf,
  insertFolders,
  onLayer
}: {
  folders: ReturnType<typeof planApiFileFolders>;
  idMap: Map<string, string>;
  targetParentId?: string | null;
  rootCollectionId?: string;
  inheritPermissionOf?: (record: ApiFileRecord) => boolean | undefined;
  insertFolders: (
    docs: BulkInsertCollectionDoc[]
  ) => ReturnType<typeof bulkInsertFolderCollections>;
  onLayer?: (result: { depth: number; created: number; failed: number; skipped: number }) => void;
}) => {
  const byDepth = new Map<number, typeof folders>();
  for (const folder of folders) {
    const layer = byDepth.get(folder.record.depth) ?? [];
    layer.push(folder);
    byDepth.set(folder.record.depth, layer);
  }
  const createdIds: string[] = [];
  const failedIds: string[] = [];
  const skippedIds: string[] = [];
  const reservedIds = new Map(folders.map(({ record, id }) => [record.apiFileId, String(id)]));

  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    const docs: BulkInsertCollectionDoc[] = [];
    let skipped = 0;
    for (const { record, id } of byDepth.get(depth)!) {
      const { parentId, apiFileParentId } = resolveApiFileRecordParent({
        record,
        idMap,
        targetParentId,
        rootCollectionId
      });
      if (parentId === undefined) {
        skippedIds.push(record.apiFileId);
        skipped++;
        continue;
      }
      docs.push({
        _id: id,
        name: record.name,
        type: DatasetCollectionTypeEnum.folder,
        apiFileId: record.apiFileId,
        metadata: { apiFileSourceId: record.sourceId },
        apiFileParentId: apiFileParentId ?? undefined,
        parentId: parentId ? new Types.ObjectId(parentId) : null,
        inheritPermission: inheritPermissionOf?.(record)
      });
    }
    const { successApiFileIds, failedApiFileIds } = docs.length
      ? await insertFolders(docs)
      : { successApiFileIds: [], failedApiFileIds: [] };
    for (const apiFileId of successApiFileIds) idMap.set(apiFileId, reservedIds.get(apiFileId)!);
    createdIds.push(...successApiFileIds);
    failedIds.push(...failedApiFileIds);
    onLayer?.({
      depth,
      created: successApiFileIds.length,
      failed: failedApiFileIds.length,
      skipped
    });
  }
  return { createdIds, failedIds, skippedIds };
};
