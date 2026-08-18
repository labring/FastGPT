import type { CanonicalWorkflowData, CanonicalAgentToolInputConfig } from './schema';
import { CanonicalWorkflowDataSchema } from './schema';
import type { LegacyWorkflowDataInput } from './legacy/schema';
import type { WorkflowMigrationOptions } from './type';
import { migrateLegacyWorkflowStructureToCurrent } from './legacy/workflow';
import { migrateAgentToolInputConfigToCurrent } from './legacy/input';
import { migrateLegacyWorkflowStructureData } from './legacy/structure';
import { FlowNodeTypeEnum } from '../node/constant';
import { NodeInputKeyEnum } from '../constants';
import { AgentToolInputModeEnum } from '../../app/tool/constants';

/**
 * 将外部 workflow 迁移为严格 canonical 数据。
 *
 * 资源 resolver 仅在 Agent 历史工具缺少 `inputs` 时调用。所有结构兼容规则都在本模块
 * 的内部 phase 完成；调用者只接收经过 strict schema 校验的结果。
 */
export const migrateWorkflowToCurrent = async (
  input: LegacyWorkflowDataInput,
  options: WorkflowMigrationOptions = {}
): Promise<CanonicalWorkflowData> => {
  // V1 重写必须由 admin dataClean 批处理完成，普通入口只接受 V2/current 数据。
  const hasLegacyV1Node = input.nodes.some(
    (node) =>
      !!node &&
      typeof node === 'object' &&
      typeof (node as Record<string, unknown>).flowType === 'string' &&
      (typeof (node as Record<string, unknown>).moduleId === 'string' ||
        typeof (node as Record<string, unknown>).nodeId !== 'string')
  );
  if (hasLegacyV1Node) {
    throw new Error('V1 workflows must be migrated through admin dataClean first');
  }

  const workflow = migrateLegacyWorkflowStructureToCurrent(
    migrateLegacyWorkflowStructureData({
      nodes: input.nodes,
      edges: input.edges,
      chatConfig: input.chatConfig
    })
  );
  const nodes = await Promise.all(
    workflow.nodes.map(async (node) => {
      if (node.flowNodeType !== FlowNodeTypeEnum.agent) return node;

      const inputs = await Promise.all(
        node.inputs.map(async (input) => {
          if (input.key !== NodeInputKeyEnum.selectedTools || !Array.isArray(input.value)) {
            return input;
          }

          const value = await Promise.all(
            input.value.map(async (tool) => {
              if (!tool || typeof tool !== 'object' || typeof tool.id !== 'string') return tool;

              const savedInputs: unknown[] = Array.isArray(tool.inputs) ? tool.inputs : [];
              const needsDefinition =
                !Array.isArray(tool.inputs) ||
                savedInputs.some(
                  (item) =>
                    !item ||
                    typeof item !== 'object' ||
                    !('mode' in item) ||
                    typeof item.mode !== 'string'
                );
              const definition = needsDefinition
                ? await options.resolveToolDefinition?.({
                    id: tool.id,
                    version: typeof tool.version === 'string' ? tool.version : undefined,
                    source: typeof tool.source === 'string' ? tool.source : undefined
                  })
                : undefined;
              const savedInputMap = new Map(
                savedInputs
                  .filter(
                    (item): item is Record<string, unknown> => !!item && typeof item === 'object'
                  )
                  .filter(
                    (item): item is Record<string, unknown> & { key: string } =>
                      typeof item.key === 'string'
                  )
                  .map((item) => [item.key, item])
              );
              const migratedInputs: CanonicalAgentToolInputConfig[] = definition
                ? definition.inputs.map((definitionInput) => {
                    const savedInput = savedInputMap.get(definitionInput.key);
                    if (savedInput) return migrateAgentToolInputConfigToCurrent(savedInput as any);
                    return {
                      key: definitionInput.key,
                      mode:
                        definitionInput.isToolParam === true
                          ? AgentToolInputModeEnum.agentGenerated
                          : AgentToolInputModeEnum.manual
                    };
                  })
                : savedInputs.map((savedInput) =>
                    migrateAgentToolInputConfigToCurrent(savedInput as any)
                  );

              return {
                ...tool,
                inputs: migratedInputs
              };
            })
          );

          return { ...input, value };
        })
      );

      return { ...node, inputs };
    })
  );

  return CanonicalWorkflowDataSchema.parse({ ...workflow, nodes });
};
