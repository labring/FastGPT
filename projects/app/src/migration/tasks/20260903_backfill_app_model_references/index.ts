import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import { runIncrementalModelReferenceMigration } from '../4163_model_references/incremental';
import { loadModelCatalog } from '../4163_model_references/modelCatalog';
import {
  backfillChatConfig,
  mergeReferenceTransformResults,
  migrateWorkflowNodes
} from '../4163_model_references/transforms';

/**
 * 按固定 endId 和 _id checkpoint 依次迁移 App、AppVersion 和 AppTemplate；
 * 三个阶段共享本轮模型快照，但各自保存独立游标和失败数据。
 */
export const backfillAppModelReferences = async (context: SystemMigrationContext) => {
  const catalog = await loadModelCatalog();
  const result = await runIncrementalModelReferenceMigration({
    context,
    stages: [
      {
        key: 'apps',
        collectionName: MongoApp.collection.name,
        model: MongoApp,
        transform: (record) => {
          const workflow = migrateWorkflowNodes({ nodes: record.modules, catalog });
          return mergeReferenceTransformResults([
            backfillChatConfig({
              chatConfig: record.chatConfig,
              pathPrefix: 'chatConfig',
              catalog
            }),
            {
              set: workflow.changed ? { modules: workflow.nodes } : undefined,
              errors: workflow.errors
            }
          ]);
        }
      },
      {
        key: 'app_versions',
        collectionName: MongoAppVersion.collection.name,
        model: MongoAppVersion,
        transform: (record) => {
          const workflow = migrateWorkflowNodes({ nodes: record.nodes, catalog });
          return mergeReferenceTransformResults([
            backfillChatConfig({
              chatConfig: record.chatConfig,
              pathPrefix: 'chatConfig',
              catalog
            }),
            {
              set: workflow.changed ? { nodes: workflow.nodes } : undefined,
              errors: workflow.errors
            }
          ]);
        }
      },
      {
        key: 'app_templates',
        collectionName: MongoAppTemplate.collection.name,
        model: MongoAppTemplate,
        transform: (record) => {
          const workflow = record.workflow ?? {};
          const nodes = migrateWorkflowNodes({ nodes: workflow.nodes, catalog });
          const modules = migrateWorkflowNodes({ nodes: workflow.modules, catalog });
          return mergeReferenceTransformResults([
            backfillChatConfig({
              chatConfig: workflow.chatConfig,
              pathPrefix: 'workflow.chatConfig',
              catalog
            }),
            {
              set: nodes.changed ? { 'workflow.nodes': nodes.nodes } : undefined,
              errors: nodes.errors
            },
            {
              set: modules.changed ? { 'workflow.modules': modules.nodes } : undefined,
              errors: modules.errors
            }
          ]);
        }
      }
    ]
  });

  return {
    appsProcessedCount: result.stageProcessedCounts.apps ?? 0,
    appVersionsProcessedCount: result.stageProcessedCounts.app_versions ?? 0,
    appTemplatesProcessedCount: result.stageProcessedCounts.app_templates ?? 0
  };
};
