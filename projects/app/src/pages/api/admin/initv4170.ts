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
import {
  Initv4170ResponseSchema,
  type Initv4170Response
} from '@fastgpt/global/openapi/admin/core/migration/api';

const logger = getLogger(LogCategories.SYSTEM);

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<Initv4170Response>
): Promise<Initv4170Response> {
  await authCert({ req, authRoot: true });

  logger.info('=== Starting model management migration (4.17.0, additive) ===');

  // Step 1: create current indexes and remove the deprecated global model unique index.
  const newIndexesCreated = await createNewIndexes();

  // Step 2: normalize and flatten models while retaining rollback fields.
  const modelMigration = await migrateModelData();

  // Step 3: build name maps from active system models and report ambiguity.
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

  return Initv4170ResponseSchema.parse({
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
  });
}

export default NextAPI(handler);
