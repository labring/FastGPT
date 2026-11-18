import type { CanonicalWorkflowData } from './schema';
import {
  CanonicalSelectedToolsValueSchema,
  CanonicalWorkflowDataSchema,
  PersistedWorkflowDataSchema
} from './schema';
import { AppTypeEnum } from '../../app/constants';
import type { LegacyWorkflowDataInput } from './legacy/schema';
import { migrateLegacyWorkflowStructureToCurrent } from './legacy/workflow';
import { migrateLegacyWorkflowStructureData } from './legacy/structure';
import { migrateWorkflowSecretValues } from './secret';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../node/constant';
import { NodeInputKeyEnum } from '../constants';
import { normalizeAgentToolInputs } from './agentToolInput';

/**
 * 将外部 workflow 迁移为严格 canonical 数据。
 *
 * 工具输入只信任 JSON 中保存的 key/mode；工具 definition、权限和 schema 水合由边界层处理。
 */
export const isLegacyV1Workflow = (nodes: unknown): boolean => {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    const record = node as Record<string, unknown>;
    const hasModuleId = typeof record.moduleId === 'string' && record.moduleId.length > 0;
    const hasValidNodeId = typeof record.nodeId === 'string' && record.nodeId.length > 0;
    return hasModuleId && !hasValidNodeId;
  });
};

export const migrateWorkflowToCurrent = (
  input: LegacyWorkflowDataInput,
  options?: { appType?: AppTypeEnum }
): CanonicalWorkflowData => {
  // V1 工作流已不再支持，普通入口只接受 V2/current 数据。
  if (isLegacyV1Workflow(input.nodes)) {
    throw new Error('V1 workflows are no longer supported');
  }

  const workflow = migrateWorkflowSecretValues(
    migrateLegacyWorkflowStructureToCurrent(
      migrateWorkflowSecretValues(
        migrateLegacyWorkflowStructureData({
          nodes: input.nodes,
          edges: input.edges,
          chatConfig: input.chatConfig
        })
      )
    )
  );

  const nodes = workflow.nodes.map((node) => {
    const nodeWithPasswordReference = {
      ...node,
      inputs: node.inputs.map((input) => {
        if (
          !input.renderTypeList.includes(FlowNodeInputTypeEnum.password) ||
          input.renderTypeList.includes(FlowNodeInputTypeEnum.reference)
        ) {
          return input;
        }

        // 新增引用能力不改变旧节点的默认模式和已保存的密码值。
        return {
          ...input,
          renderTypeList: [...input.renderTypeList, FlowNodeInputTypeEnum.reference]
        };
      })
    };

    if (nodeWithPasswordReference.flowNodeType !== FlowNodeTypeEnum.agent) {
      return nodeWithPasswordReference;
    }

    return {
      ...nodeWithPasswordReference,
      inputs: nodeWithPasswordReference.inputs.map((input) => {
        if (input.key !== NodeInputKeyEnum.selectedTools || !Array.isArray(input.value)) {
          return input;
        }

        const rawSelectedTools = input.value;
        // 工作流变量引用形态 `[nodeId, outputId]` 不是工具列表，原样保留。
        if (
          rawSelectedTools.length === 2 &&
          rawSelectedTools.every((item) => typeof item === 'string')
        ) {
          return input;
        }

        const value = rawSelectedTools.map((tool) => {
          if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return tool;

          const { config: rawConfig, inputs: rawInputs, ...availableTool } = tool;
          const { inputs, config } = normalizeAgentToolInputs({ rawInputs, rawConfig });

          return { ...availableTool, inputs, config };
        });

        return {
          ...input,
          value: CanonicalSelectedToolsValueSchema.parse(value)
        };
      })
    };
  });

  // 只有已鉴权的 MCP 工具本体保留其配置；默认的工作流保存、导入、迁移边界不保存 meta 快照。
  const schema =
    options?.appType === AppTypeEnum.mcpToolSet
      ? CanonicalWorkflowDataSchema
      : PersistedWorkflowDataSchema;
  return schema.parse({ ...workflow, nodes });
};
