import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  createNewIndexes,
  migrateModelData,
  buildModelNameToIdMap,
  migrateDatasets,
  migrateAppWorkflows,
  migrateEvaluationData,
  migrateUsageRecords,
  initSystemDefaultModels,
  migrateModelPermissions,
  migrateChannelsFromLegacyConfigs
} from '@fastgpt/service/core/ai/config/migration';

const logger = getLogger(LogCategories.SYSTEM);

export type Initv4160Response = {
  message: string;
  indexMigration: { newIndexesCreated: string[] };
  modelMigration: {
    total: number;
    flattened: number;
    isSystemSet: number;
    defaultsCleaned: number;
  };
  nameMap: {
    modelCount: number;
    nameCount: number;
    ambiguous: { name: string; ids: string[] }[];
  };
  datasetMigration: {
    total: number;
    migrated: number;
    conflicts: number;
    unresolved: { datasetId: string; field: string; value: string }[];
  };
  appWorkflowMigration: {
    appsChecked: number;
    appsMigrated: number;
    versionsMigrated: number;
    conflicts: number;
    unresolved: { appId: string; key: string; value: string }[];
  };
  evaluationMigration: {
    evalChecked: number;
    evalMigrated: number;
    conflicts: number;
    unresolved: { evalId: string; value: string }[];
  };
  usageMigration: {
    itemsChecked: number;
    itemsMigrated: number;
    conflicts: number;
    unresolved: number;
  };
  systemDefaultInit: { configured: boolean };
  permissionMigration: { total: number; migrated: number; conflicts: number; unresolved: number };
  channelMigration: { created: number; skipped: number; failed: number };
};

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<Initv4160Response>
): Promise<Initv4160Response> {
  await authCert({ req, authRoot: true });

  logger.info('=== Starting model management migration (4.16.0, additive) ===');

  // Step 1: create current indexes and remove the deprecated global model unique index.
  const newIndexesCreated = await createNewIndexes();

  // Step 2: model data migration（additive：只补缺失顶层字段；预收集 isDefault* 标记和 channel 配置）
  const modelMigration = await migrateModelData();

  // Step 3: build modelName → modelId maps（仅 isActive + isSystem 的模型；记录 ambiguous）
  const { modelMap, nameMap, ambiguous } = await buildModelNameToIdMap();

  // Steps 4-6: structured data migration (modelMap only)
  const datasetMigration = await migrateDatasets(modelMap);
  const appWorkflowMigration = await migrateAppWorkflows(modelMap);
  const evalMigration = await migrateEvaluationData(modelMap);

  // Step 7: usage records (modelMap + nameMap dual fallback for legacy semantics)
  const usageMigration = await migrateUsageRecords(modelMap, nameMap);

  // Step 8: init system default models (from collected isDefault* + modelMap)
  const systemDefaultInit = await initSystemDefaultModels(modelMigration.systemDefaults, modelMap);

  // Step 9: permission migration
  const permissionMigration = await migrateModelPermissions(modelMap);

  // Step 10: legacy requestUrl/requestAuth → aiproxy Channels
  const channelMigration = await migrateChannelsFromLegacyConfigs(modelMigration.channelConfigs);

  logger.info('=== Model management migration complete (additive) ===');

  return {
    message: 'Model management migration completed (additive)',
    indexMigration: { newIndexesCreated },
    modelMigration,
    nameMap: { modelCount: modelMap.size, nameCount: nameMap.size, ambiguous },
    datasetMigration,
    appWorkflowMigration,
    evaluationMigration: evalMigration,
    usageMigration,
    systemDefaultInit,
    permissionMigration,
    channelMigration
  };
}

export default NextAPI(handler);
