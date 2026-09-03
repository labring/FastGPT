import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration/migrate';
import type { SystemMigrationContext } from '@/migration/registry';
import { runIncrementalModelReferenceMigration } from '../4163_model_references/incremental';
import { loadModelCatalog } from '../4163_model_references/modelCatalog';
import { backfillChatConfig, migrateWorkflowNodes } from '../4163_model_references/transforms';

/**
 * 按固定 endId 和 _id checkpoint 依次迁移 App、AppVersion 和 AppTemplate；
 * 三个阶段共享本轮模型快照，但各自保存独立游标和失败数据。
 */
export const backfillAppModelReferences = async (context: SystemMigrationContext) => {
  const catalog = await loadModelCatalog();

  /**
   * 先把历史 Workflow 收敛为 canonical 结构，再基于搬运后的 chatConfig 补模型 ID。
   * 外层固定保存完整迁移结果，并将三个字段放进同一次 CAS，避免配置节点已删除但配置未落库。
   */
  const migrateWorkflow = ({
    nodes,
    edges,
    chatConfig
  }: {
    nodes: unknown;
    edges: unknown;
    chatConfig: unknown;
  }) => {
    const migratedWorkflow = migrateWorkflowToCurrent({
      nodes: Array.isArray(nodes) ? nodes : [],
      edges,
      chatConfig
    });
    const migratedNodes = migrateWorkflowNodes({ nodes: migratedWorkflow.nodes, catalog });
    const chatConfigWithModelIds = backfillChatConfig({
      chatConfig: migratedWorkflow.chatConfig,
      catalog
    });
    const workflow = {
      nodes: migratedNodes.nodes,
      edges: migratedWorkflow.edges,
      chatConfig: chatConfigWithModelIds
    };

    return { ...workflow, errors: migratedNodes.errors };
  };

  const result = await runIncrementalModelReferenceMigration({
    context,
    stages: [
      {
        key: 'apps',
        collectionName: MongoApp.collection.name,
        model: MongoApp,
        useRawCollection: true,
        transform: (record) => {
          const workflow = migrateWorkflow({
            nodes: record.modules,
            edges: record.edges,
            chatConfig: record.chatConfig
          });
          return {
            set: {
              modules: workflow.nodes,
              edges: workflow.edges,
              chatConfig: workflow.chatConfig
            },
            errors: workflow.errors
          };
        }
      },
      {
        key: 'app_versions',
        collectionName: MongoAppVersion.collection.name,
        model: MongoAppVersion,
        useRawCollection: true,
        transform: (record) => {
          const workflow = migrateWorkflow({
            nodes: record.nodes,
            edges: record.edges,
            chatConfig: record.chatConfig
          });
          return {
            set: {
              nodes: workflow.nodes,
              edges: workflow.edges,
              chatConfig: workflow.chatConfig
            },
            errors: workflow.errors
          };
        }
      },
      {
        key: 'app_templates',
        collectionName: MongoAppTemplate.collection.name,
        model: MongoAppTemplate,
        useRawCollection: true,
        transform: (record) => {
          const workflow = record.workflow ?? {};
          const nodeKeys = (() => {
            const keys: Array<'nodes' | 'modules'> = [];
            if (Array.isArray(workflow.nodes)) keys.push('nodes');
            if (Array.isArray(workflow.modules)) keys.push('modules');
            return keys.length > 0 ? keys : (['nodes'] as const);
          })();
          let edges = workflow.edges;
          let chatConfig = workflow.chatConfig;
          const set: Record<string, unknown> = {};
          const errors: string[] = [];

          for (const key of nodeKeys) {
            const migrated = migrateWorkflow({ nodes: workflow[key], edges, chatConfig });
            set[`workflow.${key}`] = migrated.nodes;
            edges = migrated.edges;
            chatConfig = migrated.chatConfig;
            errors.push(...migrated.errors);
          }
          set['workflow.edges'] = edges;
          set['workflow.chatConfig'] = chatConfig;

          return {
            set,
            errors
          };
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
