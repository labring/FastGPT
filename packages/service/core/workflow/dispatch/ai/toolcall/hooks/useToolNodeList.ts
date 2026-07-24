import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import {
  canInputBeAgentGenerated,
  getToolConfigStatus,
  getSavedToolInputSelectedType,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';
import { filterToolNodeIdByEdges } from '../../../utils';
import type { DispatchToolModuleProps, ToolNodeItemType } from '../type';

type RuntimeNode = DispatchToolModuleProps['runtimeNodes'][number];

/**
 * 归一化 ToolCall 下游工具的输入选择。
 * 旧配置只保存 selectedTypeIndex，索引 0 可能只是旧版默认手动输入；需要结合当前工具
 * 定义的 isToolParam 决定是否迁移为 Agent 生成，同时保留用户已经明确保存的选择。
 */
const normalizeToolInput = (
  input: FlowNodeInputItemType,
  allowLegacyToolDescriptionFallback: boolean
) => {
  const selectedType = getSavedToolInputSelectedType({
    savedInput: input,
    defaultInput: input,
    allowUserChatInputAgentGenerated: true,
    allowLegacyToolDescriptionFallback
  });
  const hasSavedSelection =
    input.selectedType !== undefined || input.selectedTypeIndex !== undefined;
  const renderTypeList =
    selectedType && !input.renderTypeList.includes(selectedType)
      ? [selectedType, ...input.renderTypeList]
      : input.renderTypeList;

  return initToolInputTypeByDefaultMode(
    {
      ...input,
      renderTypeList,
      ...(selectedType
        ? {
            selectedType,
            selectedTypeIndex: renderTypeList.findIndex((type) => type === selectedType)
          }
        : hasSavedSelection
          ? { selectedType: undefined, selectedTypeIndex: undefined }
          : {})
    },
    { allowUserChatInputAgentGenerated: true }
  );
};

const shouldUseLegacySystemToolInputMode = (tool: RuntimeNode) =>
  Boolean(
    tool.toolConfig?.systemTool ||
      tool.pluginId?.startsWith('systemTool-') ||
      tool.pluginId?.startsWith('commercial-')
  );

const isRunnableToolNode = (tool?: RuntimeNode): tool is RuntimeNode => {
  if (!tool) return false;
  const allowLegacyToolDescriptionFallback = shouldUseLegacySystemToolInputMode(tool);

  const configStatus = getToolConfigStatus({
    tool: {
      ...tool,
      inputs: tool.inputs.map((input) =>
        normalizeToolInput(input, allowLegacyToolDescriptionFallback)
      )
    }
  });
  return configStatus.status !== 'invalid' && configStatus.status !== 'waitingForConfig';
};

export const useToolNodeList = ({
  nodeId,
  runtimeNodes,
  runtimeEdges
}: {
  nodeId: string;
  runtimeNodes: DispatchToolModuleProps['runtimeNodes'];
  runtimeEdges: DispatchToolModuleProps['runtimeEdges'];
}): ToolNodeItemType[] => {
  const toolNodeIds = filterToolNodeIdByEdges({ nodeId, edges: runtimeEdges });

  /**
   * ToolCall 只能暴露已经配置完成的下游工具节点；
   * 等待配置/配置无效的节点不进入 function list，也不会参与本轮运行。
   */
  return toolNodeIds
    .map((nodeId) => runtimeNodes.find((item) => item.nodeId === nodeId))
    .filter(isRunnableToolNode)
    .map<ToolNodeItemType>((tool) => {
      const allowLegacyToolDescriptionFallback = shouldUseLegacySystemToolInputMode(tool);
      const inputs = tool.inputs.map((input) =>
        normalizeToolInput(input, allowLegacyToolDescriptionFallback)
      );
      // schema 构建和执行共享同一 runtime node，兼容归一化需要同步到运行态。
      tool.inputs = inputs;
      const toolParams: FlowNodeInputItemType[] = [];
      let jsonSchema = tool.jsonSchema;

      inputs.forEach((input) => {
        if (isAgentGeneratedToolInput(input) && canInputBeAgentGenerated(input)) {
          toolParams.push(input);
        }

        if (
          (input.key === NodeInputKeyEnum.toolData || input.key === 'toolData') &&
          input.value?.inputSchema
        ) {
          const value = input.value as McpToolDataType;
          jsonSchema = value.inputSchema;
        }
      });

      return {
        nodeId: tool.nodeId,
        name: tool.name,
        flowNodeType: tool.flowNodeType,
        avatar: tool.avatar,
        intro: tool.intro,
        toolDescription: tool.toolDescription,
        jsonSchema,
        inputs,
        toolParams
      };
    });
};
