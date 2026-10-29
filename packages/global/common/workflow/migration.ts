import type { CanonicalWorkflowData } from '../../core/workflow/migration/schema';
import {
  CanonicalSelectedToolsValueSchema,
  CanonicalWorkflowDataSchema
} from '../../core/workflow/migration/schema';
import type { LegacyWorkflowDataInput } from '../../core/workflow/migration/legacy/schema';
import { migrateLegacyWorkflowStructureToCurrent } from '../../core/workflow/migration/legacy/workflow';
import { migrateLegacyWorkflowStructureData } from '../../core/workflow/migration/legacy/structure';
import { migrateWorkflowSecretValues } from '../../core/workflow/migration/secret';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../core/workflow/node/constant';
import { NodeInputKeyEnum } from '../../core/workflow/constants';
import { AgentToolInputModeEnum } from '../../core/app/tool/constants';
import { isToolInputValueConfigured } from '../../core/app/formEdit/utils';
import type { FlowNodeInputItemType } from '../../core/workflow/type/io';

const canvasSizeInputKeys = new Set<string>([
  NodeInputKeyEnum.nodeWidth,
  NodeInputKeyEnum.nodeHeight,
  NodeInputKeyEnum.nestedNodeInputHeight
]);

/** 剥掉容器尺寸类隐藏 input；没有命中时返回原数组，避免无谓的新对象。 */
export const stripCanvasSizeInputs = (inputs: FlowNodeInputItemType[]): FlowNodeInputItemType[] =>
  inputs.some((input) => canvasSizeInputKeys.has(input.key))
    ? inputs.filter((input) => !canvasSizeInputKeys.has(input.key))
    : inputs;

/** 判断节点列表是否包含带 moduleId 但缺少有效 nodeId 的 V1 历史节点。 */
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

/**
 * 将外部 workflow 迁移为严格 canonical 数据。
 *
 * 工具输入只信任 JSON 中保存的 key/mode；工具 definition、权限和 schema 水合由边界层处理。
 */
export const migrateWorkflowToCurrent = (input: LegacyWorkflowDataInput): CanonicalWorkflowData => {
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

  const nodes = workflow.nodes.map((rawNode) => {
    const nodeWithPasswordReference = {
      ...rawNode,
      inputs: stripCanvasSizeInputs(rawNode.inputs).map((input) => {
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

  // 结构迁移只处理 nodes/edges/chatConfig，根级快照要显式带上，否则入站就被剥掉。
  return CanonicalWorkflowDataSchema.parse({
    ...workflow,
    nodes,
    referenceSnapshots: input.referenceSnapshots
  });
};
