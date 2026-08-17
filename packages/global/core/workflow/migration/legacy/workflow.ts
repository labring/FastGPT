import type { CanonicalWorkflowData, LegacyWorkflowDataInput } from '../schema';
import { CanonicalWorkflowDataSchema, LegacyWorkflowDataSchema } from '../schema';
import {
  migrateLegacyFlowNodeInputToCurrent,
  migrateLegacyHttpToolInputDefaultMode,
  migrateLegacyWorkflowHttpToolInputsDefaultMode,
  migrateLegacyWorkflowToolInputDefaultMode,
  migrateLegacyWorkflowToolInputsDefaultMode
} from './input';
import { migrateSystemConfigToChatConfig } from './systemConfig';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '../../constants';
import { nodeInputIsReference } from '../../utils';
import type { StoreNodeItemType } from '../../type/node';
import { shouldUseLegacyToolDescriptionFallback } from '../../../app/tool/utils';

/**
 * 详情水合前统一迁移节点的历史输入协议。
 *
 * 仅处理可由节点快照稳定推导的 legacy 字段；工具预览、权限和资源水合仍由服务层负责。
 */
export const migrateWorkflowDetailNodesToCurrent = (nodes: StoreNodeItemType[]) =>
  nodes.map((node) => {
    const allowLegacyToolDescriptionFallback = node.pluginId
      ? shouldUseLegacyToolDescriptionFallback({
          toolId: node.pluginId,
          flowNodeType: node.flowNodeType
        })
      : false;
    const inputs = (() => {
      if (
        node.flowNodeType === FlowNodeTypeEnum.pluginInput ||
        allowLegacyToolDescriptionFallback
      ) {
        return migrateLegacyWorkflowToolInputsDefaultMode(node.inputs);
      }
      if (node.flowNodeType === FlowNodeTypeEnum.httpRequest468) {
        return migrateLegacyWorkflowHttpToolInputsDefaultMode(node.inputs);
      }
      return node.inputs;
    })();

    return {
      ...node,
      inputs: inputs.map((input) =>
        migrateLegacyFlowNodeInputToCurrent(input, { deferDefaultSelection: true })
      )
    };
  });

/**
 * 将工作流按固定 phase 迁移为当前版本：
 * 1. 解析历史输入；2. 合并旧系统配置；3. 迁移节点输入；4. 校验 canonical 输出。
 * 工具定义、权限和 Schema 水合留给边界层。
 */
export const migrateWorkflowToCurrent = (input: LegacyWorkflowDataInput): CanonicalWorkflowData => {
  const legacy = LegacyWorkflowDataSchema.parse(input);
  const workflow = migrateSystemConfigToChatConfig(legacy);
  const toolNodeIds = new Set(
    workflow.edges
      .filter((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools)
      .map((edge) => edge.target)
  );
  const migrated = {
    ...workflow,
    nodes: workflow.nodes.map((node) => {
      const isTool = toolNodeIds.has(node.nodeId);
      const allowLegacyToolDescriptionFallback =
        isTool &&
        (node.flowNodeType === FlowNodeTypeEnum.pluginModule ||
          !!node.toolConfig?.systemTool ||
          !!node.pluginId?.startsWith('systemTool-') ||
          !!node.pluginId?.startsWith('commercial-'));
      const inputs = node.inputs.map((input) =>
        migrateLegacyFlowNodeInputToCurrent(
          node.flowNodeType === FlowNodeTypeEnum.httpRequest468
            ? migrateLegacyHttpToolInputDefaultMode(input)
            : input,
          { isTool, allowLegacyToolDescriptionFallback }
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
              const sourceInput = node.inputs.find(({ key }) => key === input.key);
              if (!isManualSelectionInput || sourceInput?.selectedType !== undefined) {
                return input;
              }
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

      const normalizedInputs = migratedInputs
        .map(migrateLegacyWorkflowToolInputDefaultMode)
        .map((input) => {
          const renderTypeList = (input.renderTypeList ?? []).filter(
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
        });

      return { ...node, inputs: normalizedInputs };
    })
  };

  return CanonicalWorkflowDataSchema.parse(migrated);
};
