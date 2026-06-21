import { DELETE, GET, POST } from '@/web/common/api/request';
import type { EnterpriseAuditLogSchemaType } from '@fastgpt/global/support/enterprise/audit/type';
import type { EnterpriseRoleEnum } from '@fastgpt/global/support/enterprise/rbac/constants';

export type EnterpriseAuditListQuery = {
  pageNum?: number;
  pageSize?: number;
  action?: string;
  result?: string;
  actorType?: string;
  actorUserId?: string;
  resourceType?: string;
  resourceId?: string;
  startTime?: string;
  endTime?: string;
  searchKey?: string;
};

export type EnterpriseAuditListResponse = {
  list: EnterpriseAuditLogSchemaType[];
  total: number;
  pageNum: number;
  pageSize: number;
};

export type EnterpriseRoleBindingItem = {
  _id: string;
  teamId: string;
  userId: string;
  tmbId?: string;
  roles: EnterpriseRoleEnum[];
  updateTime: string;
  createTime: string;
  user?: {
    username?: string;
  };
};

export const listEnterpriseAuditLogs = (query: EnterpriseAuditListQuery) =>
  GET<EnterpriseAuditListResponse>('/support/enterprise/audit/list', query);

export const listEnterpriseRoleBindings = () =>
  GET<EnterpriseRoleBindingItem[]>('/support/enterprise/rbac/list');

export const upsertEnterpriseRoleBinding = (data: {
  userId: string;
  tmbId?: string;
  roles: EnterpriseRoleEnum[];
}) => POST<EnterpriseRoleBindingItem>('/support/enterprise/rbac/upsert', data);

export const deleteEnterpriseRoleBinding = (userId: string) =>
  DELETE('/support/enterprise/rbac/delete', { userId });

export const getDatasetSyncStatus = (datasetId: string) =>
  GET<{
    datasetId: string;
    autoSync: boolean;
    status: string;
    errorMsg?: string;
    scheduler: null | {
      key?: string;
      next?: number;
      iterationCount?: number;
      every?: number;
      pattern?: string;
    };
  }>('/core/dataset/sync/status', { datasetId });

export const retryDatasetSync = (datasetId: string) =>
  POST<{ datasetId: string; jobId?: string }>('/core/dataset/sync/retry', { datasetId });

export const reconcileDatasetSync = () =>
  POST<{
    autoSyncDatasetCount: number;
    schedulerCount: number;
    createdSchedulerCount: number;
    createdDatasetIds: string[];
  }>('/core/dataset/sync/reconcile');

export const runEnterpriseStagingSmoke = (baseUrl?: string) =>
  POST<{
    ok: boolean;
    skipped?: boolean;
    message?: string;
    status?: number;
    latencyMs?: number;
    url?: string;
    hasJson?: boolean;
  }>('/support/enterprise/staging/smoke', { baseUrl });
