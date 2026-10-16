import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';

export const processUpdateDatasetCollaboratorSpecific = (metadata: any) => {
  const role = parseInt(metadata.permission, 10);
  const permission = new DatasetPermission({ role });
  return {
    ...metadata,
    readPermission: permission.hasReadPer ? '✔' : '✘',
    writePermission: permission.hasWritePer ? '✔' : '✘',
    managePermission: permission.hasManagePer ? '✔' : '✘'
  };
};

/** 为同步审计补齐未完成阶段的展示字段，避免 i18next 将缺失插值原样渲染。 */
export const processSyncDatasetSpecific = (metadata: any, t: any) => {
  const resultI18nKeyMap: Record<string, string> = {
    processing: 'account_team:audit_result_processing',
    success: 'account_team:audit_result_success',
    partial_failed: 'account_team:audit_result_partial_failed',
    failed: 'account_team:audit_result_failed'
  };
  const resultI18nKey =
    typeof metadata.result === 'string' ? resultI18nKeyMap[metadata.result] : undefined;

  return {
    ...metadata,
    addedCount: metadata.addedCount ?? '-',
    updatedCount: metadata.updatedCount ?? '-',
    deletedCount: metadata.deletedCount ?? '-',
    failedCount: metadata.failedCount ?? '-',
    result: resultI18nKey ? t(resultI18nKey) : (metadata.result ?? '-')
  };
};

export const createDatasetProcessors = {
  UPDATE_DATASET_COLLABORATOR: processUpdateDatasetCollaboratorSpecific,
  SYNC_DATASET: processSyncDatasetSpecific
};
