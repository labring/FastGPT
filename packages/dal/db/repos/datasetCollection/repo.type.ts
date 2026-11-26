import { EntityIdSchema } from '@fastgpt/global/common/string/entityId';
import { optionalNullToUndefined } from '@fastgpt/global/common/zod';
import z from 'zod';
import type { DbSession } from '../../types';

/** 集合所属 datasetId 查询窄 Read Schema。 */
export const DatasetCollectionDatasetIdReadSchema = z.object({
  datasetId: optionalNullToUndefined(EntityIdSchema)
});

/** 集合权限树遍历所需的窄 Read Schema（保留历史缺失 inheritPermission 语义，缺失 parentId 归一为 null）。 */
export const DatasetCollectionTreeNodeReadSchema = z.object({
  _id: EntityIdSchema,
  parentId: z.preprocess(
    (value) => (value === undefined || value === '' ? null : value),
    EntityIdSchema.nullable()
  ),
  inheritPermission: optionalNullToUndefined(z.boolean())
});
/** 集合权限树遍历所需的窄 DTO。 */
export type DatasetCollectionTreeNodeDTO = z.infer<typeof DatasetCollectionTreeNodeReadSchema>;

/** 历史 SYSTEM_ROOT 哨兵集合清理所需的窄 Read Schema。 */
export const DatasetCollectionLegacySentinelReadSchema = z.object({
  _id: EntityIdSchema,
  teamId: EntityIdSchema,
  inheritPermission: optionalNullToUndefined(z.boolean())
});
/** 历史 SYSTEM_ROOT 哨兵集合清理所需的窄 DTO。 */
export type DatasetCollectionLegacySentinelDTO = z.infer<
  typeof DatasetCollectionLegacySentinelReadSchema
>;

/**
 * API 知识库同步范围、权限物化与历史哨兵清理涉及的 DatasetCollection 持久化公开契约。
 * 统一使用字符串实体 ID 与不透明 `DbSession`，不暴露底层驱动类型。
 */
export type DatasetCollectionApiSyncRepository = {
  markIndependent: (params: {
    teamId: string;
    datasetId: string;
    collectionIds: string[];
    tx?: DbSession;
  }) => Promise<void>;
  findDatasetIdById: (params: {
    teamId: string;
    collectionId: string;
    tx?: DbSession;
  }) => Promise<string | undefined>;
  findDirectChildren: (params: {
    teamId: string;
    datasetId?: string;
    parentIds: string[];
    tx?: DbSession;
  }) => Promise<DatasetCollectionTreeNodeDTO[]>;
  reEnableSyncFolders: (params: {
    teamId: string;
    datasetId: string;
    folderIds: string[];
    tx?: DbSession;
  }) => Promise<void>;
  reEnableAllPausedApiFolders: (params: {
    teamId: string;
    datasetId: string;
    tx?: DbSession;
  }) => Promise<void>;
  findLegacySystemRootSentinels: (params: {
    datasetId: string;
    apiFileId: string;
    tx?: DbSession;
  }) => Promise<DatasetCollectionLegacySentinelDTO[]>;
  reparentLegacySystemRootChildren: (params: {
    datasetId: string;
    sentinelIds: string[];
    independentSentinelIds: string[];
    preserveIndependentSnapshot: boolean;
    tx?: DbSession;
  }) => Promise<number>;
  deleteByIds: (params: { collectionIds: string[]; tx?: DbSession }) => Promise<void>;
  unsetLegacySystemRootParentRef: (params: {
    datasetId: string;
    apiFileParentId: string;
    tx?: DbSession;
  }) => Promise<void>;
};
