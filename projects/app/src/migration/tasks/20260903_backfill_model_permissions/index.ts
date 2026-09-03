import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { clearAllMyModelsCache } from '@fastgpt/service/support/permission/model/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import { runIncrementalModelReferenceMigration } from '../4163_model_references/incremental';
import { loadModelCatalog } from '../4163_model_references/modelCatalog';

/**
 * 按 checkpoint 增量回填模型权限的 resourceId；无法匹配旧名称的悬空权限会被安全删除。
 * 每轮结束都清理成员模型目录缓存，因为失败轮次也可能已经提交部分有效权限更新。
 */
export const backfillModelPermissionReferences = async (context: SystemMigrationContext) => {
  const catalog = await loadModelCatalog();
  try {
    const result = await runIncrementalModelReferenceMigration({
      context,
      stages: [
        {
          key: 'permissions',
          collectionName: MongoResourcePermission.collection.name,
          model: MongoResourcePermission,
          query: { resourceType: PerResourceTypeEnum.model },
          transform: (record) => {
            if (record.resourceId && catalog.hasModelId(record.resourceId)) return {};

            // 权限只需确认模型身份，类型不参与匹配。
            const resourceId = catalog.resolveModelIdByName(
              typeof record.resourceName === 'string' ? record.resourceName : undefined
            );
            if (!resourceId) {
              return {
                delete: true,
                snapshot: {
                  resourceType: record.resourceType,
                  resourceId: record.resourceId,
                  resourceName: record.resourceName
                }
              };
            }
            return {
              set: { resourceId },
              snapshot: { resourceName: record.resourceName }
            };
          }
        }
      ]
    });
    return { processedCount: result.processedCount };
  } finally {
    await clearAllMyModelsCache();
  }
};
