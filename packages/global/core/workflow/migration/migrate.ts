import type { CanonicalWorkflowData } from './schema';
import { CanonicalSelectedToolsValueSchema, CanonicalWorkflowDataSchema } from './schema';
import type { LegacyWorkflowDataInput } from './legacy/schema';
import { migrateLegacyWorkflowStructureToCurrent } from './legacy/workflow';
import { migrateLegacyWorkflowStructureData } from './legacy/structure';
import { FlowNodeTypeEnum } from '../node/constant';
import { NodeInputKeyEnum } from '../constants';
import { AgentToolInputModeEnum } from '../../app/tool/constants';
import { isToolInputValueConfigured } from '../../app/formEdit/utils';

/**
 * 将外部 workflow 迁移为严格 canonical 数据。
 *
 * 工具输入只信任 JSON 中保存的 key/mode；工具 definition、权限和 schema 水合由边界层处理。
 */
export const migrateWorkflowToCurrent = (input: LegacyWorkflowDataInput): CanonicalWorkflowData => {
  // V1 工作流已不再支持，普通入口只接受 V2/current 数据。
  const hasLegacyV1Node = input.nodes.some(
    (node) =>
      !!node &&
      typeof node === 'object' &&
      typeof (node as Record<string, unknown>).flowType === 'string' &&
      (typeof (node as Record<string, unknown>).moduleId === 'string' ||
        typeof (node as Record<string, unknown>).nodeId !== 'string')
  );
  if (hasLegacyV1Node) {
    throw new Error('V1 workflows are no longer supported');
  }

  const workflow = migrateLegacyWorkflowStructureToCurrent(
    migrateLegacyWorkflowStructureData({
      nodes: input.nodes,
      edges: input.edges,
      chatConfig: input.chatConfig
    })
  );

  const nodes = workflow.nodes.map((node) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.agent) return node;

    return {
      ...node,
      inputs: node.inputs.map((input) => {
        if (input.key !== NodeInputKeyEnum.selectedTools || !Array.isArray(input.value)) {
          return input;
        }

        const value = input.value.map((tool) => {
          if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return tool;

          const { config: rawConfig, ...availableTool } = tool;
          const config =
            rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
              ? rawConfig
              : {};
          const inputs = Array.isArray(tool.inputs)
            ? tool.inputs
            : Object.entries(config).map(([key, value]) => ({
                key,
                mode: isToolInputValueConfigured({
                  input: { renderTypeList: [], value, defaultValue: undefined }
                })
                  ? AgentToolInputModeEnum.manual
                  : AgentToolInputModeEnum.agentGenerated
              }));

          return { ...availableTool, inputs, config };
        });

        return {
          ...input,
          value: CanonicalSelectedToolsValueSchema.parse(value)
        };
      })
    };
  });

  return CanonicalWorkflowDataSchema.parse({ ...workflow, nodes });
};
