import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { getToolConfigStatus } from '@fastgpt/global/core/app/formEdit/utils';
import { filterToolNodeIdByEdges } from '../../../utils';
import type { DispatchToolModuleProps, ToolNodeItemType } from '../type';

type RuntimeNode = DispatchToolModuleProps['runtimeNodes'][number];

const isRunnableToolNode = (tool?: RuntimeNode): tool is RuntimeNode => {
  if (!tool) return false;

  const configStatus = getToolConfigStatus({
    tool
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
      const toolParams: FlowNodeInputItemType[] = [];
      let jsonSchema = tool.jsonSchema;

      tool.inputs.forEach((input) => {
        if (input.toolDescription) {
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
        toolParams
      };
    });
};
