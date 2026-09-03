import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { migrateSystemConfigToChatConfig } from '@fastgpt/global/core/workflow/migration/legacy/systemConfig';
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
   * 只搬运已废弃的 userGuide/pluginConfig，再补模型 ID；不能在原始 BSON 上执行完整
   * Workflow 迁移，因为 ToolSet JSON Schema 在数据库中按设计保存为字符串。
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
    const storedNodes = Array.isArray(nodes) ? nodes : [];
    const migratedWorkflow = migrateSystemConfigToChatConfig({
      nodes: storedNodes.map((node) => {
        if (
          !node ||
          typeof node !== 'object' ||
          !['userGuide', 'pluginConfig'].includes((node as any).flowNodeType) ||
          Array.isArray((node as any).inputs)
        ) {
          return node;
        }
        // 配置节点即使缺少 inputs 也应能安全删除，不能让单条历史脏数据阻断整批迁移。
        return { ...(node as any), inputs: [] };
      }) as any,
      edges: (Array.isArray(edges) ? edges : []) as any,
      chatConfig:
        chatConfig && typeof chatConfig === 'object' && !Array.isArray(chatConfig)
          ? (chatConfig as any)
          : undefined
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
