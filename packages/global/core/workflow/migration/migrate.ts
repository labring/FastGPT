import type { CanonicalWorkflowData, CanonicalAgentToolInputConfig } from './schema';
import {
  CanonicalAgentToolInputConfigSchema,
  CanonicalWorkflowDataSchema,
  LegacyAgentToolInputSnapshotSchema
} from './schema';
import type { LegacyWorkflowDataInput } from './legacy/schema';
import type { WorkflowMigrationOptions } from './type';
import { migrateLegacyWorkflowStructureToCurrent } from './legacy/workflow';
import { LegacyAgentToolInputConfigSchema } from './legacy/schema';
import { migrateLegacyWorkflowStructureData } from './legacy/structure';
import { FlowNodeTypeEnum } from '../node/constant';
import { NodeInputKeyEnum } from '../constants';
import { AgentToolInputModeEnum } from '../../app/tool/constants';

/**
 * 将外部 workflow 迁移为严格 canonical 数据。
 *
 * 当前工具定义可得时，按定义修复每个输入；定义不可得时保留 unavailable 占位和恢复快照。
 * 所有结构兼容规则都在本模块的内部 phase 完成；调用者只接收经过 strict schema 校验的结果。
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

              const hasSavedInputs = Array.isArray(tool.inputs);
              const savedInputs: unknown[] = (() => {
                if (tool.isUnavailable === true && Array.isArray(tool.unresolvedInputs)) {
                  return tool.unresolvedInputs;
                }
                return hasSavedInputs ? tool.inputs : [];
              })();
              const needsDefinition =
                tool.isUnavailable === true ||
                !hasSavedInputs ||
                savedInputs.some(
                  (item) => !CanonicalAgentToolInputConfigSchema.safeParse(item).success
                );
              const definition = needsDefinition
                ? await options.resolveToolDefinition?.({
                    id: tool.id,
                    version: typeof tool.version === 'string' ? tool.version : undefined,
                    source: typeof tool.source === 'string' ? tool.source : undefined
                  })
                : undefined;
              if (!needsDefinition) return tool;

              if (!definition) {
                const unresolvedInputs = savedInputs.flatMap((input) => {
                  const result = LegacyAgentToolInputSnapshotSchema.safeParse(input);
                  return result.success ? [result.data] : [];
                });
                const {
                  inputs: _inputs,
                  unresolvedInputs: _unresolvedInputs,
                  ...unavailableTool
                } = tool;

                return {
                  ...unavailableTool,
                  isUnavailable: true,
                  ...(unresolvedInputs.length > 0 ? { unresolvedInputs } : {})
                };
              }

              const savedInputMap = new Map(
                savedInputs.flatMap((input) => {
                  const result = LegacyAgentToolInputConfigSchema.safeParse(input);
                  return result.success ? [[result.data.key, result.data] as const] : [];
                })
              );
              const migratedInputs: CanonicalAgentToolInputConfig[] = definition.inputs.map(
                (definitionInput) => {
                  const savedInput = savedInputMap.get(definitionInput.key);
                  return (
                    savedInput ?? {
                      key: definitionInput.key,
                      mode:
                        definitionInput.isToolParam === true
                          ? AgentToolInputModeEnum.agentGenerated
                          : AgentToolInputModeEnum.manual
                    }
                  );
                }
              );
              const {
                isUnavailable: _isUnavailable,
                unresolvedInputs: _unresolvedInputs,
                ...availableTool
              } = tool;

              return { ...availableTool, inputs: migratedInputs };
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
