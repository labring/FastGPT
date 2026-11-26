import { EntityIdSchema } from '@fastgpt/global/common/string/entityId';
import { optionalNullToUndefined } from '@fastgpt/global/common/zod';
import { ApiDatasetServerSchema } from '@fastgpt/global/core/dataset/apiDataset/type';
import z from 'zod';
import type { DbSession } from '../../types';

/** 写权限同步加锁后返回的知识库配置窄 Read Schema。 */
export const DatasetPermissionLockReadSchema = z.object({
  apiDatasetServer: optionalNullToUndefined(ApiDatasetServerSchema)
});
/** 写权限同步加锁后返回的知识库配置窄 DTO。 */
export type DatasetPermissionLockDTO = z.infer<typeof DatasetPermissionLockReadSchema>;

/** 清理历史 SYSTEM_ROOT 哨兵所需的知识库元信息窄 Read Schema。 */
export const DatasetLegacySystemRootMetaReadSchema = z.object({
  _id: EntityIdSchema,
  teamId: EntityIdSchema,
  collectionPermissionEnabled: optionalNullToUndefined(z.boolean())
});
/** 清理历史 SYSTEM_ROOT 哨兵所需的知识库元信息窄 DTO。 */
export type DatasetLegacySystemRootMetaDTO = z.infer<typeof DatasetLegacySystemRootMetaReadSchema>;

/**
 * API 知识库同步范围与权限托管涉及的 Dataset 持久化公开契约。
 * 统一使用字符串实体 ID 与不透明 `DbSession`，不暴露底层驱动类型。
 */
export type DatasetApiSyncRepository = {
  bumpCollectionPermissionVersion: (params: {
    datasetId: string;
    teamId: string;
    tx?: DbSession;
  }) => Promise<DatasetPermissionLockDTO | null>;
  updateSyncScope: (params: {
    teamId: string;
    datasetId: string;
    syncAll?: boolean;
    tx?: DbSession;
  }) => Promise<void>;
  findLegacySystemRootMetaById: (params: {
    datasetId: string;
    tx?: DbSession;
  }) => Promise<DatasetLegacySystemRootMetaDTO | null>;
  markSyncAllEnabled: (params: { datasetId: string; tx?: DbSession }) => Promise<void>;
};
