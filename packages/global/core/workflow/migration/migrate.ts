import type {
  CanonicalAgentToolInputConfig,
  CanonicalFlowNodeInputItem,
  CanonicalWorkflowData,
  LegacyAgentToolInputConfig,
  LegacyFlowNodeInputItem,
  LegacyWorkflowData
} from './schema';
import {
  CanonicalAgentToolInputConfigSchema,
  CanonicalWorkflowDataSchema,
  LegacyAgentToolInputConfigSchema,
  LegacyWorkflowDataSchema
} from './schema';
import { normalizeFlowNodeInputType } from '../../app/formEdit/utils';
import { normalizeWorkflowToolInputsDefaultMode } from '../../app/tool/workflowTool/utils';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../node/constant';
import { NodeOutputKeyEnum } from '../constants';
import { NodeInputKeyEnum } from '../constants';
import { nodeInputIsReference } from '../utils';

// [TODO] add an explicit version field and dispatch migrations by version.

/**
 * 将单个历史输入收敛为当前 selectedType 协议，并移除旧索引。
 */
export const migrateFlowNodeInputToCurrent = (
  input: LegacyFlowNodeInputItem
): CanonicalFlowNodeInputItem => {
  const { selectedTypeIndex: _selectedTypeIndex, ...canonicalInput } = input;
  const selectedType =
    input.selectedType ??
    (input.selectedTypeIndex === undefined
      ? undefined
      : input.renderTypeList?.[input.selectedTypeIndex]);

  return {
    ...canonicalInput,
    renderTypeList: input.renderTypeList ?? [],
    ...(selectedType === undefined ? {} : { selectedType })
  } as CanonicalFlowNodeInputItem;
};

/**
 * 将 Agent 工具的完整历史 NodeIO 或当前配置统一为 `{ key, mode }`。
 */
export const migrateAgentToolInputConfigToCurrent = (
  input: LegacyAgentToolInputConfig
): CanonicalAgentToolInputConfig =>
  CanonicalAgentToolInputConfigSchema.parse(LegacyAgentToolInputConfigSchema.parse(input));

/**
 * 将工作流迁移为当前版本。
 * 迁移只处理可由结构稳定推导的字段；工具定义、权限和 Schema 水合留给边界层。
 */
export const migrateWorkflowToCurrent = (input: LegacyWorkflowData): CanonicalWorkflowData => {
  const legacy = LegacyWorkflowDataSchema.parse(input);
  const toolNodeIds = new Set(
    legacy.edges
      .filter((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools)
      .map((edge) => edge.target)
  );
  const migrated = {
    ...legacy,
    nodes: legacy.nodes.map((node) => {
      const isTool = toolNodeIds.has(node.nodeId);
      const allowLegacyToolDescriptionFallback =
        isTool &&
        (node.flowNodeType === FlowNodeTypeEnum.pluginModule ||
          !!node.toolConfig?.systemTool ||
          !!node.pluginId?.startsWith('systemTool-') ||
          !!node.pluginId?.startsWith('commercial-'));
      const inputs = node.inputs.map((input) =>
        migrateFlowNodeInputToCurrent(
          normalizeFlowNodeInputType(input, {
            isTool,
            allowLegacyToolDescriptionFallback
          })
        )
      );

      const migratedInputs =
        node.flowNodeType === FlowNodeTypeEnum.agent
          ? inputs.map((input) => {
              const isManualSelectionInput = [
                NodeInputKeyEnum.skills,
                NodeInputKeyEnum.selectedTools,
                NodeInputKeyEnum.datasetSelectList
              ].includes(input.key as NodeInputKeyEnum);
              if (!isManualSelectionInput) return input;
              return {
                ...input,
                selectedType: input.renderTypeList[0],
                value: nodeInputIsReference(input) ? [] : input.value
              };
            })
          : inputs;

      if (node.flowNodeType !== FlowNodeTypeEnum.pluginInput) {
        return { ...node, inputs: migratedInputs };
      }

      const normalizedInputs = normalizeWorkflowToolInputsDefaultMode(migratedInputs).map(
        (input) => {
          const renderTypeList = input.renderTypeList.filter(
            (type) => type !== FlowNodeInputTypeEnum.agentGenerated
          );
          return {
            ...input,
            renderTypeList,
            selectedType:
              input.selectedType === FlowNodeInputTypeEnum.agentGenerated
                ? renderTypeList[0]
                : input.selectedType
          };
        }
      );

      return { ...node, inputs: normalizedInputs };
    })
  };

  return CanonicalWorkflowDataSchema.parse(migrated);
};
