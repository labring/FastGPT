import type { DbSession } from '../../types';

/** 集合权限树遍历所需的窄 DTO。 */
export type DatasetCollectionTreeNodeDTO = {
  _id: string;
  parentId?: string | null;
  inheritPermission?: boolean;
};

/** 历史 SYSTEM_ROOT 哨兵集合清理所需的窄 DTO。 */
export type DatasetCollectionLegacySentinelDTO = {
  _id: string;
  teamId: string;
  inheritPermission?: boolean;
};

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
