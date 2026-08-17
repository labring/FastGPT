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
      return {
        nodeId: tool.nodeId,
        name: tool.name,
        flowNodeType: tool.flowNodeType,
        avatar: tool.avatar,
        intro: tool.intro,
        toolDescription: tool.toolDescription,
        jsonSchema: tool.jsonSchema,
        inputs: tool.inputs
      };
    });
};
