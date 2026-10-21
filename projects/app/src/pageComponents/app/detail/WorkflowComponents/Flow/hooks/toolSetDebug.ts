import { getHTTPToolRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

/** 将选中的工具集子工具作为一次独立调试的入口，并沿用父节点 ID 展示运行记录。 */
export const getToolSetDebugRuntimeNode = ({
  toolSetNode,
  toolIndex,
  previewNode
}: {
  toolSetNode: RuntimeNodeItemType;
  toolIndex: number;
  previewNode?: Pick<RuntimeNodeItemType, 'name' | 'inputs' | 'outputs' | 'toolConfig' | 'version'>;
}): RuntimeNodeItemType | undefined => {
  const mcpToolSet = toolSetNode.toolConfig?.mcpToolSet;
  const httpToolSet = toolSetNode.toolConfig?.httpToolSet;
  const tool = (mcpToolSet?.toolList ?? httpToolSet?.toolList)?.[toolIndex];
  if (!tool) return;

  if (toolSetNode.pluginId) {
    if (!previewNode?.toolConfig?.mcpTool && !previewNode?.toolConfig?.httpTool) return;
    return {
      nodeId: toolSetNode.nodeId,
      flowNodeType: FlowNodeTypeEnum.tool,
      name: `${toolSetNode.name}/${tool.name}`,
      avatar: toolSetNode.avatar,
      inputs: previewNode.inputs,
      outputs: previewNode.outputs,
      toolConfig: previewNode.toolConfig,
      version: previewNode.version
    };
  }

  if (mcpToolSet && 'url' in mcpToolSet) {
    const selectedTool = mcpToolSet.toolList[toolIndex];
    return getMCPToolRuntimeNode({
      nodeId: toolSetNode.nodeId,
      toolsetName: toolSetNode.name,
      avatar: toolSetNode.avatar,
      tool: selectedTool,
      url: mcpToolSet.url,
      headerSecret: mcpToolSet.headerSecret ?? undefined
    });
  }

  if (httpToolSet && !('toolId' in httpToolSet)) {
    const selectedTool = httpToolSet.toolList[toolIndex];
    const runtimeNode = getHTTPToolRuntimeNode({
      nodeId: toolSetNode.nodeId,
      toolsetName: toolSetNode.name,
      avatar: toolSetNode.avatar,
      toolSetId: 'inline',
      tool: selectedTool
    });
    const { headerSecret: _headerSecret, ...toolWithoutHeaderSecret } = selectedTool;

    return {
      ...runtimeNode,
      toolConfig: {
        httpTool: {
          ...toolWithoutHeaderSecret,
          baseUrl: httpToolSet.baseUrl,
          apiSchemaStr: httpToolSet.apiSchemaStr,
          customHeaders: httpToolSet.customHeaders,
          headerSecret: httpToolSet.headerSecret ?? undefined
        }
      }
    };
  }
};
